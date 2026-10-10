/**
 * A fake `livekit-client` for Vitest (T923): just the parts `call.ts` uses, with the same event names, so the engine and
 * the store are tested without WebRTC. Tests reach the last room through `FakeRoom.last` and fire its events with `emit`.
 */
import type { LiveKitModule } from './call'

type Handler = (...args: never[]) => void

class Emitter {
  private handlers = new Map<string, Handler[]>()
  on(event: string, h: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), h])
    return this
  }
  emit(event: string, ...args: unknown[]) {
    for (const h of this.handlers.get(event) ?? []) (h as (...a: unknown[]) => void)(...args)
  }
}

export const RoomEvent = {
  ActiveSpeakersChanged: 'activeSpeakersChanged',
  ConnectionQualityChanged: 'connectionQualityChanged',
  ParticipantConnected: 'participantConnected',
  ParticipantDisconnected: 'participantDisconnected',
  TrackSubscribed: 'trackSubscribed',
  TrackUnsubscribed: 'trackUnsubscribed',
  TrackMuted: 'trackMuted',
  TrackUnmuted: 'trackUnmuted',
  LocalTrackPublished: 'localTrackPublished',
  LocalTrackUnpublished: 'localTrackUnpublished',
  ParticipantPermissionsChanged: 'participantPermissionsChanged',
  MediaDevicesError: 'mediaDevicesError',
  AudioPlaybackStatusChanged: 'audioPlaybackChanged',
  Reconnecting: 'reconnecting',
  SignalReconnecting: 'signalReconnecting',
  Reconnected: 'reconnected',
  Disconnected: 'disconnected',
} as const

export const DisconnectReason = { UNKNOWN_REASON: 0, CLIENT_INITIATED: 1, DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5, JOIN_FAILURE: 7, SIGNAL_CLOSE: 9, ROOM_CLOSED: 10 } as const

const preset = (height: number, maxBitrate: number) => ({ resolution: { width: Math.round((height * 16) / 9), height }, encoding: { maxBitrate } })

export class FakeTrack extends Emitter {
  stopped = false
  attached: HTMLMediaElement[] = []
  readonly kind: 'audio' | 'video'
  constructor(kind: 'audio' | 'video') {
    super()
    this.kind = kind
  }
  stop() {
    this.stopped = true
  }
  attach(el?: HTMLMediaElement) {
    const target = el ?? document.createElement(this.kind)
    this.attached.push(target)
    return target
  }
  detach(el?: HTMLMediaElement) {
    const out = el ? [el] : this.attached
    this.attached = this.attached.filter((x) => !out.includes(x))
    return out
  }
}

export class FakePublication {
  isMuted = false
  enabled = true
  readonly source: string
  track: FakeTrack | undefined
  constructor(source: string, track: FakeTrack | undefined) {
    this.source = source
    this.track = track
  }
  setEnabled(on: boolean) {
    this.enabled = on
  }
}

export class FakeParticipant {
  isSpeaking = false
  connectionQuality = 'unknown'
  permissions: { canPublish: boolean; canPublishSources: number[] } | undefined
  trackPublications = new Map<string, FakePublication>()
  readonly identity: string
  readonly name: string
  readonly isLocal: boolean
  constructor(identity: string, name: string, isLocal = false) {
    this.identity = identity
    this.name = name
    this.isLocal = isLocal
  }
  getTrackPublication(source: string) {
    return this.trackPublications.get(source)
  }
  get isMicrophoneEnabled() {
    const p = this.trackPublications.get('microphone')
    return !!p && !p.isMuted
  }
  get isCameraEnabled() {
    const p = this.trackPublications.get('camera')
    return !!p && !p.isMuted
  }
}

/** What `getUserMedia` would throw, per source, on the next switch-on. */
export const deviceFailures = new Map<string, Error>()

export class FakeLocalParticipant extends FakeParticipant {
  requests: [string, boolean][] = []
  private readonly room: FakeRoom
  constructor(room: FakeRoom) {
    super('me', 'Me', true)
    this.room = room
  }
  setMicrophoneEnabled(on: boolean) {
    return this.setSource('microphone', on)
  }
  setCameraEnabled(on: boolean) {
    return this.setSource('camera', on)
  }
  private async setSource(source: string, on: boolean) {
    this.requests.push([source, on])
    await Promise.resolve()
    const pub = this.trackPublications.get(source)
    if (!on) {
      if (pub) {
        pub.isMuted = true
        pub.track?.stop()
        this.room.emit(RoomEvent.TrackMuted, pub, this)
      }
      return pub
    }
    const failure = deviceFailures.get(source)
    if (failure) {
      deviceFailures.delete(source)
      throw failure
    }
    if (pub && pub.track && !pub.track.stopped) {
      pub.isMuted = false
      this.room.emit(RoomEvent.TrackUnmuted, pub, this)
      return pub
    }
    const fresh = new FakePublication(source, new FakeTrack(source === 'camera' ? 'video' : 'audio'))
    this.trackPublications.set(source, fresh)
    this.room.emit(RoomEvent.LocalTrackPublished, fresh, this)
    return fresh
  }
  /** What the call server does when a source is no longer allowed: the track is unpublished and stopped. */
  unpublish(source: string) {
    const pub = this.trackPublications.get(source)
    if (!pub) return
    this.trackPublications.delete(source)
    pub.track?.stop()
    this.room.emit(RoomEvent.LocalTrackUnpublished, pub, this)
  }
}

export class FakeRoom extends Emitter {
  static last: FakeRoom | null = null
  static created = 0
  /** Makes the next `connect` fail. */
  static failConnect = false
  readonly options: unknown
  localParticipant: FakeLocalParticipant
  remoteParticipants = new Map<string, FakeParticipant>()
  canPlaybackAudio = true
  connected: [string, string] | null = null
  disconnected: boolean | null = null
  audioStarts = 0
  constructor(options: unknown) {
    super()
    this.options = options
    this.localParticipant = new FakeLocalParticipant(this)
    FakeRoom.last = this
    FakeRoom.created++
  }
  async connect(url: string, token: string) {
    await Promise.resolve()
    if (FakeRoom.failConnect) {
      FakeRoom.failConnect = false
      throw new Error('could not establish signal connection')
    }
    this.connected = [url, token]
    this.localParticipant.permissions = { canPublish: true, canPublishSources: [1, 2] }
  }
  async disconnect(stopTracks?: boolean) {
    this.disconnected = stopTracks ?? true
    this.emit(RoomEvent.Disconnected, DisconnectReason.CLIENT_INITIATED)
  }
  async startAudio() {
    this.audioStarts++
  }
  /** A remote person joins with a microphone track already subscribed. */
  addRemote(identity: string, name = identity) {
    const p = new FakeParticipant(identity, name)
    this.remoteParticipants.set(identity, p)
    this.emit(RoomEvent.ParticipantConnected, p)
    return p
  }
  /** The call server changes your permissions (research R22) and unpublishes what is no longer allowed. */
  setPermissions(sources: number[]) {
    const local = this.localParticipant
    const prev = local.permissions
    local.permissions = { canPublish: sources.length > 0, canPublishSources: sources }
    if (!sources.includes(2)) local.unpublish('microphone')
    if (!sources.includes(1)) local.unpublish('camera')
    this.emit(RoomEvent.ParticipantPermissionsChanged, prev, local)
  }
}

export function resetFakeLiveKit() {
  FakeRoom.last = null
  FakeRoom.created = 0
  FakeRoom.failConnect = false
  deviceFailures.clear()
}

/** The fake module, shaped like `livekit-client` for the parts `call.ts` reads. */
export const fakeLiveKit = {
  Room: FakeRoom,
  RoomEvent,
  DisconnectReason,
  Track: { Kind: { Audio: 'audio', Video: 'video' }, Source: { Camera: 'camera', Microphone: 'microphone' } },
  TrackEvent: { Ended: 'ended' },
  VideoPresets: { h180: preset(180, 160_000), h360: preset(360, 450_000), h540: preset(540, 800_000), h720: preset(720, 1_700_000) },
  AudioPresets: { speech: { maxBitrate: 24_000 } },
} as unknown as LiveKitModule
