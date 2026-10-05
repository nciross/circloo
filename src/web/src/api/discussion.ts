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
