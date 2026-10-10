import { api } from './client'

/** Contract types of the live discussion stage (spec 009, contracts/hub.md and contracts/rest.md). */
export interface Seat {
  memberId: string
  state: 'invited' | 'onStage' | 'reconnecting'
  /** As reported by the seat, false while muted. */
  audioOn: boolean
  videoOn: boolean
  mutedByAnimator: boolean
}

/** Viewers are counted, never listed. */
export interface StageView {
  seats: Seat[]
  watching: number
}

export type StageNoticeKind = 'muted' | 'unmute-allowed' | 'removed' | 'floor-taken' | 'seat-moved' | 'seat-lost' | 'discussion-ended'
export type SignalKind = 'offer' | 'answer' | 'ice'

/** `GET /api/circles/{id}/discussion/ice`: STUN (later TURN) servers, never media. */
export interface IceConfig {
  iceServers: RTCIceServer[]
  ttlSeconds: number
}

export const fetchIce = (circleId: string) => api<IceConfig>(`/api/circles/${circleId}/discussion/ice`)

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
