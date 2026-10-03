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

/** Every edit returns the fresh detail; it replaces the cache so the version stays current. */
function useEdit<V>(id: string, request: (vars: V, version: number, current?: PresentationDetail) => Promise<PresentationDetail>) {
  const qc = useQueryClient()
  return useMutation({
    // Edits to one presentation run one after another, so each reads the version the previous one returned
    // (a rename on Enter then blur, or a delete right after a rename, would otherwise send a stale version).
    scope: { id: `presentation:${id}` },
    mutationFn: (vars: V) => {
      const current = qc.getQueryData<PresentationDetail>(detailKey(id))
      return request(vars, current?.version ?? 0, current)
    },
    onSuccess: (detail) => {
      qc.setQueryData(detailKey(id), detail)
      void qc.invalidateQueries({ queryKey: presentationsKey, exact: true })
    },
    // Someone (another tab) changed it first: reload the truth. Returning the promise holds the next queued edit
    // until the fresh version is in the cache.
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

/** What the question form sends (contracts/rest.md `QuestionInput`); option ids are assigned by the server. */
export interface QuestionInput {
  kind: 'poll' | 'quiz'
  question: string
  options: { text: string }[]
  multipleChoice?: boolean
  correctOption?: string | null
  timerSeconds?: number | null
  showFirst?: boolean
  showLive?: boolean
}

export const QUESTION_MAX = 140
export const OPTION_MAX = 80
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 6
export const TIMERS = [10, 15, 20, 30, 45, 60] as const

/** The timer choices, plus a value set elsewhere (any 10–60 is valid on the server) so it is never shown wrong. */
export const timerChoices = (current: number | null | undefined): number[] =>
  current && !(TIMERS as readonly number[]).includes(current) ? [...TIMERS, current].sort((a, b) => a - b) : [...TIMERS]
export const OPTION_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

export const useAddQuestion = (id: string) =>
  useEdit<QuestionInput & { afterSlideId?: string | null }>(id, (body, version) =>
    api(`/api/presentations/${id}/questions`, { method: 'POST', body: { ...body, version } }))

export const useUpdateQuestion = (id: string) =>
  useEdit<{ slideId: string; question: QuestionInput }>(id, ({ slideId, question }, version) =>
    api(`/api/presentations/${id}/slides/${slideId}`, { method: 'PUT', body: { ...question, version } }))

/**
 * Moves one slide to the place of another (drag) or by `delta` places (keyboard). The order is computed when the
 * request starts, from the latest saved order, so quick repeated moves never send a stale one.
 */
export const useMoveSlide = (id: string) =>
  useEdit<{ slideId: string; delta?: number; to?: string }>(id, ({ slideId, delta, to }, version, current) => {
    const ids = (current?.slides ?? []).map((s) => s.id)
    const step = to ? ids.indexOf(to) - ids.indexOf(slideId) : (delta ?? 0)
    return api(`/api/presentations/${id}/order`, { method: 'PUT', body: { slideIds: moved(ids, slideId, step), version } })
  })

/** Moves one slide by `delta` places and returns the new full order. */
export function moved(ids: string[], id: string, delta: number): string[] {
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return ids
  const next = [...ids]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** The form values of an existing question slide. */
export const fromSlide = (s: SlideView): QuestionInput => ({
  kind: s.kind === 'quiz' ? 'quiz' : 'poll',
  question: s.question ?? '',
  options: (s.options ?? []).map((o) => ({ text: o.text })),
  multipleChoice: s.multipleChoice,
  correctOption: s.correctOption,
  timerSeconds: s.timerSeconds ?? 20,
  showFirst: s.showFirst,
  showLive: s.showLive,
})

/**
 * Removes answer `index`. The quiz's correct answer follows its option when one above it goes; when the correct
 * answer itself is removed, none is marked, so the author picks again instead of saving a wrong one.
 */
export function withoutOption(q: QuestionInput, index: number): QuestionInput {
  const options = q.options.filter((_, k) => k !== index)
  if (q.kind !== 'quiz') return { ...q, options }
  const correct = q.correctOption ? OPTION_IDS.indexOf(q.correctOption as (typeof OPTION_IDS)[number]) : -1
  const next = correct < 0 || correct === index ? null : OPTION_IDS[correct > index ? correct - 1 : correct]
  return { ...q, options, correctOption: next }
}
