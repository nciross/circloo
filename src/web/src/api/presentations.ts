import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, csrfHeaders } from './client'

/** Mirrors contracts/rest.md (spec 006). */
export type PresentationStatus = 'processing' | 'ready' | 'failed'

export interface PresentationSummary {
  id: string
  name: string
  status: PresentationStatus
  error: string | null
  slideCount: number
  processedSlides: number
  questionCount: number
  thumbnail: string | null
  lastUsedAt: string
  deletesInDays: number | null
}

export interface SlideOption {
  id: string
  text: string
}

export interface SlideView {
  id: string
  kind: 'deck' | 'poll' | 'quiz'
  position: number
  hidden: boolean
  notes: string | null
  image: string | null
  thumbnail: string | null
  question: string | null
  options: SlideOption[] | null
  multipleChoice: boolean
  correctOption: string | null
  timerSeconds: number | null
  showFirst: boolean
  showLive: boolean
}

export interface PresentationDetail extends PresentationSummary {
  showPodium: boolean
  version: number
  slides: SlideView[]
}

/** Upload refusal and failure codes the server returns; each has a message in `presentations.errors.*`. */
export const ERROR_CODES = ['not-pptx', 'encrypted', 'macros', 'too-large', 'too-many-slides', 'conversion-failed', 'timeout'] as const
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const ACCEPT = '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'

export const presentationsKey = ['presentations'] as const
const detailKey = (id: string) => ['presentations', id] as const

/** Polls every second while something converts, and not at all otherwise. */
const whileProcessing = (busy: boolean) => (busy ? 1000 : false)
/** A 4xx (gone, forbidden) won't change on retry: fail fast so the page can react. */
const retry = (count: number, err: Error) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 3

export const usePresentations = () =>
  useQuery({
    queryKey: presentationsKey,
    queryFn: ({ signal }) => api<PresentationSummary[]>('/api/presentations', { signal }),
    refetchInterval: (q) => whileProcessing(q.state.data?.some((p) => p.status === 'processing') ?? false),
    retry,
  })

export const usePresentation = (id: string) =>
  useQuery({
    queryKey: detailKey(id),
    queryFn: ({ signal }) => api<PresentationDetail>(`/api/presentations/${id}`, { signal }),
    refetchInterval: (q) => whileProcessing(q.state.data?.status === 'processing'),
    retry,
  })

/**
 * Uploads a deck with XMLHttpRequest, which (unlike fetch) reports upload progress: decks can be 50 MB.
 * Resolves with the new presentation (status "processing"); rejects with an ApiError carrying the refusal code.
 */
export async function uploadPresentation(file: File, onProgress: (fraction: number) => void): Promise<PresentationSummary> {
  const headers = await csrfHeaders()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/presentations')
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onerror = () => reject(new ApiError(0))
    xhr.onload = () => {
      let body: unknown
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined
      } catch {
        body = undefined
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as PresentationSummary)
      else {
        const retry = Number(xhr.getResponseHeader('Retry-After'))
        reject(new ApiError(xhr.status, (body ?? {}) as Partial<{ type: string; title: string }>, Number.isFinite(retry) && retry > 0 ? retry : undefined))
      }
    }
    const form = new FormData()
    form.append('file', file, file.name)
    xhr.send(form)
  })
}

export function useUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress: (f: number) => void }) => uploadPresentation(file, onProgress),
    onSuccess: () => qc.invalidateQueries({ queryKey: presentationsKey }),
  })
}

/**
 * Every edit returns the fresh detail; it replaces the cache so the version stays current.
 * Edits to one presentation run one after another (shared scope), so each reads the version the previous one returned.
 */
function useEdit<V>(id: string, request: (vars: V, version: number) => Promise<PresentationDetail>) {
  const qc = useQueryClient()
  return useMutation({
    scope: { id: `presentation:${id}` },
    mutationFn: (vars: V) => request(vars, qc.getQueryData<PresentationDetail>(detailKey(id))?.version ?? 0),
    onSuccess: (detail) => {
      qc.setQueryData(detailKey(id), detail)
      void qc.invalidateQueries({ queryKey: presentationsKey, exact: true })
    },
    // Someone (another tab) changed it first: reload the truth.
    onError: (err) => (err instanceof ApiError && err.status === 409 ? qc.invalidateQueries({ queryKey: detailKey(id) }) : undefined),
  })
}

export const useUpdatePresentation = (id: string) =>
  useEdit<{ name?: string; showPodium?: boolean }>(id, (body, version) =>
    api(`/api/presentations/${id}`, { method: 'PATCH', body: { ...body, version } }))

export const useSetHidden = (id: string) =>
  useEdit<{ slideId: string; hidden: boolean }>(id, ({ slideId, hidden }, version) =>
    api(`/api/presentations/${id}/slides/${slideId}`, { method: 'PUT', body: { hidden, version } }))

export const useDeleteSlide = (id: string) =>
  useEdit<string>(id, (slideId, version) => api(`/api/presentations/${id}/slides/${slideId}?version=${version}`, { method: 'DELETE' }))

export function useDeletePresentation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/presentations/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: detailKey(id) })
      return qc.invalidateQueries({ queryKey: presentationsKey })
    },
  })
}

/** The message key for an upload or conversion problem. */
export function errorKey(code: string | null | undefined): string {
  return code && (ERROR_CODES as readonly string[]).includes(code) ? `presentations.errors.${code}` : 'common.errorGeneric'
}
