/**
 * Camera and microphone access for the live discussion (spec 009 R14).
 * Nothing here logs, stores or uploads media, and no device label is ever read or sent.
 */

export type MediaKind = 'audio' | 'video'
export type MediaProblem = 'denied' | 'no-device' | 'busy' | 'blocked' | 'unsupported'

export type MediaResult = { ok: true; track: MediaStreamTrack } | { ok: false; problem: MediaProblem }

/** 640x360 at 24 fps: enough for a tile, light enough for a mesh upload. */
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } }

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

/** Asks for one kind only, never both at once, so one failure never blocks the other. */
export async function requestTrack(kind: MediaKind): Promise<MediaResult> {
  if (!mediaSupported()) return { ok: false, problem: 'unsupported' }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: true } : { video: VIDEO_CONSTRAINTS })
    const track = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
    if (!track) {
      for (const t of stream.getTracks()) t.stop()
      return { ok: false, problem: 'no-device' }
    }
    return { ok: true, track }
  } catch (e) {
    return { ok: false, problem: classifyMediaError(e) }
  }
}

export interface OpenedMedia {
  audio: MediaStreamTrack | null
  video: MediaStreamTrack | null
  /** The first thing that went wrong, if anything. A failed camera with a working microphone is audio only, not a failure to join. */
  problem: MediaProblem | null
}

/** Microphone first, then camera (only if wanted). Each kind is requested on its own. */
export async function openMedia(want: { audio: boolean; video: boolean }): Promise<OpenedMedia> {
  const out: OpenedMedia = { audio: null, video: null, problem: null }
  if (want.audio) {
    const a = await requestTrack('audio')
    if (a.ok) out.audio = a.track
    else out.problem = a.problem
  }
  if (want.video) {
    const v = await requestTrack('video')
    if (v.ok) out.video = v.track
    else out.problem ??= v.problem
  }
  return out
}

export function stopTrack(track: MediaStreamTrack | null | undefined) {
  track?.stop()
}
