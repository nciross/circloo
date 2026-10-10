import { api } from './client'

/** `POST /api/circles/{id}/call/token` (contracts/rest.md): a call pass, valid a few minutes, never stored or logged. */
export interface CallPass {
  /** The call server's WebSocket address. */
  url: string
  token: string
  /** Your member id on the call server. */
  identity: string
  expiresAt: string
  /** Mirrors of the pass, to draw the buttons before connecting; the call server enforces the pass itself. */
  canSpeak: boolean
  canVideo: boolean
}

export const fetchCallPass = (circleId: string) => api<CallPass>(`/api/circles/${circleId}/call/token`, { method: 'POST' })

/** `CallNotice(kind, byMemberId?, subjectMemberId?)` (contracts/hub.md): live only, never stored. */
export const CALL_NOTICE_KINDS = [
  'call-started', 'call-ended', 'video-on', 'video-off', 'mode-open', 'mode-hand', 'muted-everyone',
  'floor-given', 'floor-taken', 'mic-muted', 'mic-allowed', 'camera-stopped', 'camera-allowed', 'removed', 'allowed-back',
] as const
export type CallNoticeKind = (typeof CALL_NOTICE_KINDS)[number]
