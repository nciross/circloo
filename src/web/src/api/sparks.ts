import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Locale } from '../i18n'

export type Audience = 'family' | 'friends' | 'work'
export type Tone = 'silly' | 'cozy' | 'deep'
export type Kind = 'icebreaker' | 'would-you-rather' | 'joke' | 'riddle'

export interface Spark {
  id: string
  lang: Locale
  kind: Kind
  tone: Tone
  audiences: Audience[]
  kidsSafe: boolean
  text: string
  answer?: string | null
  source: 'seed' | 'ai'
  favourite: boolean
}

export interface DrawResult {
  spark: Spark | null
  poolSize: number
  exhausted: boolean
}

export interface DrawFilters {
  lang: Locale
  audience: Audience
  tone: Tone
  kind: Kind
  kidsSafe: boolean
}

export interface Fresh {
  index: number
  text: string
  kind: Kind
  answer?: string | null
}

export interface AskResult {
  items: Fresh[]
  keepToken: string
  remainingToday: number
}

export interface Allowance {
  remainingToday: number
  limit: number
  resetsAt: string
}

export function drawSpark(f: DrawFilters, exclude: string[], signal?: AbortSignal) {
  const q = new URLSearchParams({ lang: f.lang, audience: f.audience, tone: f.tone, kind: f.kind, kidsSafe: String(f.kidsSafe) })
  if (exclude.length) q.set('exclude', exclude.slice(-200).join(','))
  return api<DrawResult>(`/api/sparks/draw?${q.toString()}`, { signal })
}

export const favouritesKey = ['sparks', 'favourites'] as const
export const mineKey = ['sparks', 'mine'] as const
export const allowanceKey = ['ai', 'allowance'] as const

export const useFavourites = () => useQuery({ queryKey: favouritesKey, queryFn: ({ signal }) => api<Spark[]>('/api/sparks/favourites', { signal }) })
export const useMine = () => useQuery({ queryKey: mineKey, queryFn: ({ signal }) => api<Spark[]>('/api/sparks/mine', { signal }) })
export const useAllowance = () => useQuery({ queryKey: allowanceKey, queryFn: ({ signal }) => api<Allowance>('/api/ai/allowance', { signal }) })

export function useToggleFavourite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      api<void>(`/api/sparks/${encodeURIComponent(id)}/favourite`, { method: on ? 'PUT' : 'DELETE', body: on ? {} : undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sparks'] }),
  })
}

export function useAsk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DrawFilters & { theme?: string }) => api<AskResult>('/api/ai/sparks', { method: 'POST', body }),
    onSettled: () => qc.invalidateQueries({ queryKey: allowanceKey }),
  })
}

export function useKeep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { keepToken: string; index: number }) => api<Spark>('/api/ai/sparks/keep', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: mineKey }),
  })
}

export function useDeleteMine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/sparks/mine/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sparks'] }),
  })
}
