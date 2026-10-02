import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, refreshCsrf } from './client'
import type { Locale } from '../i18n'
import type { CharacterId } from '../components/characters'

export type Role = 'animator' | 'participant'

export interface Member {
  id: string
  role: Role
  name: string
  character: CharacterId
}

export interface Message {
  id: number
  activityId: string | null
  memberId: string | null
  kind: 'member' | 'ai' | 'system'
  text: string
  at: string
}

export interface CircleSummary {
  id: string
  name: string
  joinCode: string | null
  role: Role
  status: 'open' | 'closed'
  createdAt: string
  people: number
}

export interface CircleView {
  id: string
  name: string
  joinCode: string | null
  activities: string[]
  currentActivity: string | null
  status: 'open' | 'closed'
  locale: Locale
  me: Member
  members: Member[]
  messages: Message[]
}

export interface JoinInfo {
  circleId: string
  name: string
  animatorName: string
  animatorCharacter: CharacterId
  taken: CharacterId[]
  full: boolean
  alreadyIn: boolean
}

export const circlesKey = ['circles'] as const
export const circleKey = (id: string) => ['circle', id] as const

export const useMyCircles = () =>
  useQuery({ queryKey: circlesKey, queryFn: ({ signal }) => api<CircleSummary[]>('/api/circles', { signal }) })

export const useCircle = (id: string) =>
  useQuery({ queryKey: circleKey(id), queryFn: ({ signal }) => api<CircleView>(`/api/circles/${id}`, { signal }), retry: false, staleTime: Infinity })

export function useCreateCircle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; activities: string[]; character: CharacterId; locale: Locale }) =>
      api<CircleSummary>('/api/circles', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: circlesKey }),
  })
}

export function useCloseCircle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/circles/${id}/close`, { method: 'POST', body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: circlesKey }),
  })
}

export const useJoinInfo = (code: string) =>
  useQuery({ queryKey: ['join', code], queryFn: ({ signal }) => api<JoinInfo>(`/api/join/${encodeURIComponent(code)}`, { signal }), retry: false })

export function useJoin(code: string) {
  return useMutation({
    mutationFn: (body: { name: string; character: CharacterId }) =>
      api<{ circleId: string; memberId: string }>(`/api/join/${encodeURIComponent(code)}`, { method: 'POST', body }),
    // A guest has a new identity now: the CSRF token must be bound to it.
    onSuccess: () => refreshCsrf(),
  })
}

/** The shareable link for a join code, on this origin. */
export const joinLink = (code: string) => `${window.location.origin}/join/${code}`
