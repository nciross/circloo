import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, refreshCsrf } from './client'
import type { Locale } from '../i18n'

export interface Me {
  id: string
  email: string
  displayName: string | null
  locale: Locale
  profileCompleted: boolean
}

export interface PublicSpark {
  id: string
  lang: Locale
  kind: 'icebreaker' | 'would-you-rather'
  text: string
}

export const meKey = ['me'] as const

/** The signed-in user, or null when there is no session. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async ({ signal }) => {
      try {
        return await api<Me>('/api/me', { signal })
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
    retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2,
  })
}

export function useRequestCode() {
  return useMutation({
    mutationFn: (body: { email: string; locale: Locale }) =>
      api<{ status: 'sent'; resendAfterSeconds: number }>('/api/auth/otp/request', { method: 'POST', body }),
  })
}

export function useVerifyCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; code: string }) =>
      api<{ me: Me; isNewUser: boolean }>('/api/auth/otp/verify', { method: 'POST', body }),
    onSuccess: (data) => qc.setQueryData(meKey, data.me),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { displayName: string; locale: Locale }) => api<Me>('/api/me/profile', { method: 'PUT', body }),
    onSuccess: (me) => qc.setQueryData(meKey, me),
  })
}

function useSignOutBase(path: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(path, { method: 'POST', body: {} }),
    onSettled: async () => {
      qc.setQueryData(meKey, null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'spark' })
      await refreshCsrf()
    },
  })
}

export const useSignOut = () => useSignOutBase('/api/auth/signout')
export const useSignOutEverywhere = () => useSignOutBase('/api/auth/signout-everywhere')

export async function fetchRandomSpark(lang: Locale, exclude?: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ lang })
  if (exclude) q.set('exclude', exclude)
  return api<PublicSpark>(`/api/public/sparks/random?${q.toString()}`, { signal })
}
