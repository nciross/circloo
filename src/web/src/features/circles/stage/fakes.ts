/** Test doubles for WebRTC and media (jsdom has none). Used by the stage tests only. */

export class FakeTrack {
  enabled = true
  stopped = false
  readonly kind: 'audio' | 'video'
  constructor(kind: 'audio' | 'video') {
    this.kind = kind
  }
  stop() {
    this.stopped = true
  }
}

export const asTrack = (t: FakeTrack) => t as unknown as MediaStreamTrack

class FakeSender {
  track: FakeTrack | null = null
  params: { encodings: { maxBitrate?: number }[] } = { encodings: [] }
  replaceTrack(t: FakeTrack | null) {
    this.track = t
    return Promise.resolve()
  }
  getParameters() {
    return this.params
  }
  setParameters(p: { encodings: { maxBitrate?: number }[] }) {
    this.params = p
    return Promise.resolve()
  }
}

class FakeTransceiver {
  sender = new FakeSender()
  receiver: { track: FakeTrack }
  readonly kind: 'audio' | 'video'
  direction: string
  constructor(kind: 'audio' | 'video', direction: string) {
    this.kind = kind
    this.direction = direction
    this.receiver = { track: new FakeTrack(kind) }
  }
}

export type StatsRow = Record<string, unknown>

export class FakePeer {
  static all: FakePeer[] = []
  iceConnectionState = 'new'
  signalingState = 'stable'
  remoteDescription: { type: string; sdp: string } | null = null
  localDescription: { type: string; sdp: string } | null = null
  transceivers: FakeTransceiver[] = []
  candidates: unknown[] = []
  offers: ({ iceRestart?: boolean } | undefined)[] = []
  closed = false
  stats: StatsRow[] = []
  onicecandidate: ((e: { candidate: { toJSON: () => unknown } | null }) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  ontrack: ((e: { track: FakeTrack }) => void) | null = null

  readonly config: unknown
  constructor(config: unknown) {
    this.config = config
    FakePeer.all.push(this)
  }
  addTransceiver(kind: 'audio' | 'video', init: { direction: string }) {
    this.transceivers.push(new FakeTransceiver(kind, init.direction))
  }
  getTransceivers() {
    return this.transceivers
  }
  createOffer(o?: { iceRestart?: boolean }) {
    this.offers.push(o)
    return Promise.resolve({ type: 'offer', sdp: 'v=0 offer' })
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'v=0 answer' })
  }
  setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable'
    return Promise.resolve()
  }
  setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d
    if (d.type === 'offer') {
      this.signalingState = 'have-remote-offer'
      if (!this.transceivers.length) this.transceivers = [new FakeTransceiver('audio', 'sendrecv'), new FakeTransceiver('video', 'sendrecv')]
    } else this.signalingState = 'stable'
    for (const t of this.transceivers) this.ontrack?.({ track: t.receiver.track })
    return Promise.resolve()
  }
  addIceCandidate(c: unknown) {
    this.candidates.push(c)
    return Promise.resolve()
  }
  getStats() {
    const rows = this.stats
    return Promise.resolve({ forEach: (cb: (s: StatsRow) => void) => rows.forEach(cb) })
  }
  /** The browser finds a local candidate. */
  candidate(c: unknown = { candidate: 'candidate:1' }) {
    this.onicecandidate?.({ candidate: { toJSON: () => c } })
  }
  iceState(s: string) {
    this.iceConnectionState = s
    this.oniceconnectionstatechange?.()
  }
  video() {
    return this.transceivers.find((t) => t.kind === 'video')
  }
  audio() {
    return this.transceivers.find((t) => t.kind === 'audio')
  }
  close() {
    this.closed = true
  }
}

export const asPeer = (p: FakePeer) => p as unknown as RTCPeerConnection
export const makePeer = (config: unknown) => asPeer(new FakePeer(config))
