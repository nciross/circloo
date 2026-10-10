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

/** Which set of steps re-allows a blocked device: the browsers differ in where they keep a site's permissions. */
export type BrowserFamily = 'chromium' | 'android' | 'firefox' | 'safari' | 'ios' | 'other'

export function browserFamily(
  ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
  touch: boolean = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1,
): BrowserFamily {
  // iPadOS asks for desktop pages and says Macintosh; its touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chromium'
  if (/Safari\//.test(ua)) return 'safari'
  return 'other'
}
