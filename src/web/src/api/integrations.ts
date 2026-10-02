import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export type Provider = 'teams' | 'jira' | 'confluence' | 'notion'
export const PROVIDERS: Provider[] = ['teams', 'jira', 'confluence', 'notion']

/** The fields each service needs; secrets are write-only and never come back from the server. */
export const FIELDS: Record<Provider, { name: string; secret?: boolean; type?: string }[]> = {
  teams: [{ name: 'webhookUrl', type: 'url', secret: true }],
  jira: [{ name: 'site' }, { name: 'email', type: 'email' }, { name: 'apiToken', secret: true }, { name: 'projectKey' }],
  confluence: [{ name: 'site' }, { name: 'email', type: 'email' }, { name: 'apiToken', secret: true }, { name: 'spaceId' }],
  notion: [{ name: 'token', secret: true }, { name: 'parentPageId' }],
}

/** Self-hosted brand marks in /public/brands (trademarks of their owners). */
export const LOGOS: Record<Provider | 'salesforce', string[]> = {
  teams: ['teams', 'microsoft365'],
  jira: ['jira'],
  confluence: ['confluence'],
  notion: ['notion'],
  salesforce: ['salesforce'],
}

export interface IntegrationView {
  provider: Provider
  connected: boolean
  hint: string | null
  lastUsedAt: string | null
}

export const integrationsKey = ['integrations'] as const

export const useIntegrations = (enabled = true) =>
  useQuery({ queryKey: integrationsKey, queryFn: ({ signal }) => api<IntegrationView[]>('/api/integrations', { signal }), enabled })

export function useConnect(provider: Provider) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Record<string, string>) => api<IntegrationView>(`/api/integrations/${provider}`, { method: 'PUT', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationsKey }),
  })
}

export function useDisconnect(provider: Provider) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>(`/api/integrations/${provider}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationsKey }),
  })
}

export const useTestConnection = (provider: Provider) =>
  useMutation({ mutationFn: () => api<{ ok: boolean; status: number | null }>(`/api/integrations/${provider}/test`, { method: 'POST', body: {} }) })

export const useExport = (circleId: string) =>
  useMutation({
    mutationFn: (body: { provider: Provider; titles: Record<string, string> }) =>
      api<{ url: string | null; created: number }>(`/api/circles/${circleId}/export`, { method: 'POST', body }),
  })
