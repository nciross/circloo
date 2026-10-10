/**
 * The call engine of spec 009 (T923, research R25): a thin adapter over `livekit-client`, which only this file loads, and
 * only through `import()` when a person taps Join call, so the room page never pays for it. The store (`stage.ts`) talks
 * to it through `CallEngine` and `CallListener`, so Vitest drives it with a fake module.
 *
 * What it promises:
 * - nothing is asked of the camera or the microphone until the person switches one on, and one kind at a time;
 * - the call server's permissions win: a revoked source goes off here too, and nothing is ever switched on by itself;
 * - on a phone, a camera stopped by locking the screen or switching apps stays off until the person switches it on.
 */
import type * as LK from 'livekit-client'
import type { CallPass } from '../../../api/discussion'
import { classifyMediaError, type MediaKind, type MediaProblem } from './media'

export type LiveKitModule = typeof LK

export type CallConnection = 'idle' | 'joining' | 'connected' | 'reconnecting' | 'failed'
export type CallQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown'
/** Why the call server closed the connection: the store turns it into idle or failed. */
export type CallEnd = 'removed' | 'ended' | 'elsewhere' | 'lost'

/** What a tile needs from a video, without knowing LiveKit. Adaptive stream sizes it to the element it is attached to. */
export interface CallVideo {
  attach(el: HTMLVideoElement): void
  detach(el: HTMLVideoElement): void
  /** Off-page tiles switch it off so the call server stops sending it to this receiver. No effect on your own preview. */
  setEnabled(on: boolean): void
}

export interface CallParticipant {
  /** The member id (the identity on the call server). */
  id: string
  name: string
  local: boolean
  speaking: boolean
  quality: CallQuality
  mic: boolean
  camera: boolean
  /** Set while the camera is on and its video is here to show. */
  video: CallVideo | null
}

/** What the call server lets you publish right now. */
export interface CallRights {
  canSpeak: boolean
  canVideo: boolean
}

export interface CallListener {
  onConnection(state: 'connected' | 'reconnecting'): void
  /** The call server closed the connection; never called after `leave()`. */
  onEnded(reason: CallEnd): void
  onParticipants(list: CallParticipant[]): void
  onRights(rights: CallRights): void
  onDevices(mine: { mic: boolean; camera: boolean }): void
  onDeviceProblem(kind: MediaKind, problem: MediaProblem): void
  /** The browser refused to play sound until the next tap. */
  onAudioBlocked(blocked: boolean): void
}

export interface CallEngine {
  /** Starts playback (still inside the Join tap as far as the browser is concerned), then connects with the pass. */
  connect(pass: CallPass): Promise<void>
  /** Plays the call's sound again after the browser blocked it; call it from a tap. */
  startAudio(): Promise<void>
  /** Resolves with the device's state afterwards. Requests are queued: never two devices at once. */
  setMic(on: boolean): Promise<boolean>
  setCamera(on: boolean): Promise<boolean>
  /** Disconnects and stops every local track. */
  leave(): Promise<void>
}

export interface EngineOptions {
  load?: () => Promise<LiveKitModule>
  /** Phones capture 540p and stop the camera when the page is hidden. Detected from the browser by default. */
  phone?: boolean
}

let loading: Promise<LiveKitModule> | null = null

/** The one place `livekit-client` is loaded. A failed download is tried again on the next join. */
export function loadLiveKit(): Promise<LiveKitModule> {
  loading ??= import('livekit-client').catch((e: unknown) => {
    loading = null
    throw e
  })
  return loading
}

export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false
  const hint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile
  return hint ?? /Mobi|Android|iPhone|iPad|Tablet/.test(navigator.userAgent)
}

/**
 * Research R25: adaptive stream and dynacast (nobody receives or sends a quality nobody watches), two simulcast layers
 * under a 720p capture (540p on phones), VP8 for the widest support, Opus with DTX and RED and the speech preset. Audio
 * goes out at high priority so a weak network loses video quality first, then video, and keeps the voices.
 */
export function roomOptions(lk: LiveKitModule, phone: boolean): LK.RoomOptions {
  const capture = phone ? lk.VideoPresets.h540 : lk.VideoPresets.h720
  return {
    adaptiveStream: true,
    dynacast: true,
    disconnectOnPageLeave: true,
    stopLocalTrackOnUnpublish: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    videoCaptureDefaults: { resolution: capture.resolution },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [lk.VideoPresets.h180, lk.VideoPresets.h360],
      videoCodec: 'vp8',
      videoEncoding: capture.encoding,
      audioPreset: { ...lk.AudioPresets.speech, priority: 'high' },
      dtx: true,
      red: true,
    },
  }
}

// TrackSource of the call server's protocol (`canPublishSources`), not re-exported by livekit-client.
const SOURCE_CAMERA = 1
const SOURCE_MICROPHONE = 2

/** The call server's permission in two words. An empty source list means every source (research R20). */
export function rightsOf(permission: { canPublish: boolean; canPublishSources?: number[] } | undefined): CallRights {
  if (!permission?.canPublish) return { canSpeak: false, canVideo: false }
  const sources = permission.canPublishSources ?? []
  if (sources.length === 0) return { canSpeak: true, canVideo: true }
  return { canSpeak: sources.includes(SOURCE_MICROPHONE), canVideo: sources.includes(SOURCE_CAMERA) }
}

export async function createCallEngine(listener: CallListener, options: EngineOptions = {}): Promise<CallEngine> {
  const lk = await (options.load ?? loadLiveKit)()
  return new LiveKitCall(lk, listener, options.phone ?? isPhone())
}

const QUALITIES = new Set<string>(['excellent', 'good', 'poor', 'lost', 'unknown'])

class LiveKitCall implements CallEngine {
  private readonly room: LK.Room
  private readonly videos = new WeakMap<object, CallVideo>()
  private audioBox: HTMLElement | null = null
  private devices: Promise<unknown> = Promise.resolve()
  private leaving = false
  private watching = false
  private readonly lk: LiveKitModule
  private readonly listener: CallListener
  private readonly phone: boolean

  constructor(lk: LiveKitModule, listener: CallListener, phone: boolean) {
    this.lk = lk
    this.listener = listener
    this.phone = phone
    this.room = new lk.Room(roomOptions(lk, phone))
    this.wire()
  }

  async connect(pass: CallPass) {
    void this.startAudio()
    await this.room.connect(pass.url, pass.token, { autoSubscribe: true })
    document.addEventListener('visibilitychange', this.onVisibility)
    this.watching = true
    this.listener.onRights(this.room.localParticipant.permissions ? rightsOf(this.room.localParticipant.permissions) : { canSpeak: pass.canSpeak, canVideo: pass.canVideo })
    this.emitDevices()
    this.emitParticipants()
  }

  async startAudio() {
    try {
      await this.room.startAudio()
    } catch {
      // Reported through canPlaybackAudio below.
    }
    this.listener.onAudioBlocked(!this.room.canPlaybackAudio)
  }

  setMic(on: boolean) {
    return this.device('audio', on)
  }

  setCamera(on: boolean) {
    return this.device('video', on)
  }

  async leave() {
    this.leaving = true
    this.unwatch()
    const local = this.room.localParticipant
    const tracks = [...local.trackPublications.values()].flatMap((p) => (p.track ? [p.track] : []))
    try {
      await this.room.disconnect(true)
    } finally {
      // Belt and braces: the camera light and the microphone go off even if the server never answered.
      for (const t of tracks) t.stop()
      this.audioBox?.remove()
      this.audioBox = null
    }
  }

  /** One device at a time, in the order asked; a failure is the person's to fix, never an error of the call. */
  private device(kind: MediaKind, on: boolean): Promise<boolean> {
    const local = this.room.localParticipant
    const run = async () => {
      if (this.leaving) return false
      try {
        if (kind === 'audio') await local.setMicrophoneEnabled(on)
        else await local.setCameraEnabled(on)
      } catch (e) {
        if (on) this.listener.onDeviceProblem(kind, classifyMediaError(e))
      }
      this.emitDevices()
      this.emitParticipants()
      return kind === 'audio' ? local.isMicrophoneEnabled : local.isCameraEnabled
    }
    const next = this.devices.then(run, run)
    this.devices = next.catch(() => undefined)
    return next
  }

  private wire() {
    const E = this.lk.RoomEvent
    const refresh = () => this.emitParticipants()
    this.room
      .on(E.ActiveSpeakersChanged, refresh)
      .on(E.ConnectionQualityChanged, refresh)
      .on(E.ParticipantConnected, refresh)
      .on(E.ParticipantDisconnected, refresh)
      .on(E.TrackSubscribed, (track) => {
        if (track.kind === this.lk.Track.Kind.Audio) this.play(track)
        refresh()
      })
      .on(E.TrackUnsubscribed, (track) => {
        for (const el of track.detach()) el.remove()
        refresh()
      })
      .on(E.TrackMuted, (_pub, p) => this.onLocalChange(p.isLocal))
      .on(E.TrackUnmuted, (_pub, p) => this.onLocalChange(p.isLocal))
      .on(E.LocalTrackPublished, (pub) => {
        if (pub.source === this.lk.Track.Source.Camera) pub.track?.on(this.lk.TrackEvent.Ended, this.onCameraLost)
        this.onLocalChange(true)
      })
      .on(E.LocalTrackUnpublished, () => this.onLocalChange(true))
      .on(E.ParticipantPermissionsChanged, (_prev, p) => {
        if (p.isLocal) this.onRights()
        refresh()
      })
      .on(E.MediaDevicesError, (e, kind) => this.listener.onDeviceProblem(kind === 'videoinput' ? 'video' : 'audio', classifyMediaError(e)))
      .on(E.AudioPlaybackStatusChanged, () => this.listener.onAudioBlocked(!this.room.canPlaybackAudio))
      .on(E.Reconnecting, () => this.listener.onConnection('reconnecting'))
      .on(E.SignalReconnecting, () => this.listener.onConnection('reconnecting'))
      .on(E.Reconnected, () => this.listener.onConnection('connected'))
      .on(E.Disconnected, (reason) => this.onDisconnected(reason))
  }

  /** Remote voices play in hidden elements; started by `startAudio` in the Join tap. */
  private play(track: LK.RemoteTrack) {
    if (!this.audioBox) {
      this.audioBox = document.createElement('div')
      this.audioBox.hidden = true
      this.audioBox.dataset.call = 'audio'
      document.body.append(this.audioBox)
    }
    this.audioBox.append(track.attach())
  }

  private onLocalChange(local: boolean) {
    if (local) this.emitDevices()
    this.emitParticipants()
  }

  /** The server took a source away (and unpublished it): the device follows, and nothing comes back by itself. */
  private onRights() {
    const local = this.room.localParticipant
    const rights = rightsOf(local.permissions)
    this.listener.onRights(rights)
    if (!rights.canSpeak && local.isMicrophoneEnabled) void this.device('audio', false)
    if (!rights.canVideo && local.isCameraEnabled) void this.device('video', false)
  }

  /** The browser ended the camera (a hidden page, the device taken away): it is off and stays off until switched on. */
  private onCameraLost = () => {
    void this.device('video', false)
  }

  /** Phones stop the camera when the screen locks or another app opens; switch it off first so it never restarts alone. */
  private onVisibility = () => {
    if (document.visibilityState === 'hidden' && this.phone && this.room.localParticipant.isCameraEnabled) this.onCameraLost()
  }

  private onDisconnected(reason: LK.DisconnectReason | undefined) {
    this.unwatch()
    this.audioBox?.remove()
    this.audioBox = null
    if (this.leaving) return
    this.leaving = true
    const R = this.lk.DisconnectReason
    const end: CallEnd =
      reason === R.PARTICIPANT_REMOVED ? 'removed'
        : reason === R.ROOM_DELETED || reason === R.ROOM_CLOSED ? 'ended'
          : reason === R.DUPLICATE_IDENTITY ? 'elsewhere'
            : 'lost'
    this.listener.onEnded(end)
  }

  private unwatch() {
    if (!this.watching) return
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.watching = false
  }

  private emitDevices() {
    const local = this.room.localParticipant
    this.listener.onDevices({ mic: local.isMicrophoneEnabled, camera: local.isCameraEnabled })
  }

  private emitParticipants() {
    const people: LK.Participant[] = [this.room.localParticipant, ...this.room.remoteParticipants.values()]
    this.listener.onParticipants(people.map((p) => this.describe(p)))
  }

  private describe(p: LK.Participant): CallParticipant {
    const cam = p.getTrackPublication(this.lk.Track.Source.Camera)
    const quality = String(p.connectionQuality)
    return {
      id: p.identity,
      name: p.name ?? '',
      local: p.isLocal,
      speaking: p.isSpeaking,
      quality: (QUALITIES.has(quality) ? quality : 'unknown') as CallQuality,
      mic: p.isMicrophoneEnabled,
      camera: p.isCameraEnabled,
      video: cam?.track && !cam.isMuted ? this.videoOf(cam, p.isLocal) : null,
    }
  }

  /** One handle per publication, so tiles keep the same object while nothing changes. */
  private videoOf(pub: LK.TrackPublication, local: boolean): CallVideo {
    let handle = this.videos.get(pub)
    if (!handle) {
      handle = {
        attach: (el) => void pub.track?.attach(el),
        detach: (el) => void pub.track?.detach(el),
        setEnabled: (on) => {
          if (!local) (pub as LK.RemoteTrackPublication).setEnabled(on)
        },
      }
      this.videos.set(pub, handle)
    }
    return handle
  }
}
