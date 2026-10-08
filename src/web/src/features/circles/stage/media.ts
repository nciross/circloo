/**
 * Camera and microphone access for the live discussion (spec 009 R14).
 * Nothing here logs, stores or uploads media, and no device label is ever read or sent.
 */

export type MediaKind = 'audio' | 'video'
export type MediaProblem = 'denied' | 'no-device' | 'busy' | 'blocked' | 'unsupported'

/** Both are needed to join the call; without them the person can still chat and raise a hand. */
export function mediaSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** Maps a getUserMedia failure to what the person can do about it. Unknown errors count as a busy device (try again). */
export function classifyMediaError(error: unknown): MediaProblem {
  switch ((error as { name?: string } | null)?.name) {
    case 'NotAllowedError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-device'
    case 'SecurityError':
      return 'blocked'
    case 'NotReadableError':
    case 'AbortError':
    default:
      return 'busy'
  }
}
