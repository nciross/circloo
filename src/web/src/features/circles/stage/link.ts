/**
 * One WebRTC link between two people (spec 009 R3 and R14).
 *
 * Both sides add an audio and a video transceiver up front, so mic and camera start and stop with `replaceTrack` and
 * the only renegotiation is one ICE restart. The side that offers is chosen by the mesh (a viewer, else the smaller
 * member id), so two offers never cross. A message that carries another `linkId` than this link's is discarded.
 *
 * Nothing in this file logs or stores media, SDP or ICE candidates; they only travel through `send`.
 */
import type { SignalKind } from '../../../api/discussion'

export type LinkState = 'connecting' | 'connected' | 'weak' | 'failed' | 'closed'
/** What is actually reaching the screen from the other side, for `data-receiving`. */
export type Receiving = 'none' | 'audio' | 'video' | 'audio-video'

export interface LinkOptions {
  peer: RTCPeerConnection
  remoteId: string
  /** The offerer picks the `linkId`; the answerer is given the one from the offer. */
  role: 'offerer' | 'answerer'
  linkId: string
  /** This side sends media on the link. */
  sends: boolean
  /** This side receives media on the link. */
  receives: boolean
  send: (kind: SignalKind, linkId: string, payload: string) => void
  onChange?: () => void
  /** Upper bound for the video upload on this link, bits per second. */
  videoBitrate?: number
}

/** Weak-link rule (R14): loss above 15 % or round trip above 800 ms over two samples. */
export const SAMPLE_EVERY_MS = 3000
export const WEAK_LOSS = 0.15
export const WEAK_RTT_MS = 800
export const WEAK_SAMPLES = 2
/** Ten seconds of good samples bring the video back. */
export const RECOVER_SAMPLES = Math.ceil(10_000 / SAMPLE_EVERY_MS)

type Kind = 'audio' | 'video'

export class PeerLink {
  readonly remoteId: string
  readonly role: 'offerer' | 'answerer'
  readonly linkId: string
  private readonly peer: RTCPeerConnection
  private readonly opts: LinkOptions
  private current: LinkState = 'connecting'
  private tracks: Record<Kind, MediaStreamTrack | null> = { audio: null, video: null }
  private remote: Record<Kind, MediaStreamTrack | null> = { audio: null, video: null }
  private allowed: Record<Kind, boolean> = { audio: false, video: false }
  private pendingIce: RTCIceCandidateInit[] = []
  private failures = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private bad = 0
  private good = 0
  private last: { lost: number; received: number } | null = null
  private bitrate: number | undefined

  constructor(opts: LinkOptions) {
    this.opts = opts
    this.peer = opts.peer
    this.remoteId = opts.remoteId
    this.role = opts.role
    this.linkId = opts.linkId
    this.bitrate = opts.videoBitrate
    this.peer.onicecandidate = (e) => {
      if (this.current !== 'closed' && e.candidate) this.opts.send('ice', this.linkId, JSON.stringify(e.candidate.toJSON()))
    }
    this.peer.oniceconnectionstatechange = () => this.onIceState()
    this.peer.ontrack = (e) => {
      const kind = e.track.kind as Kind
      if (kind !== 'audio' && kind !== 'video') return
      this.remote[kind] = e.track
      e.track.enabled = this.allowed[kind]
      this.changed()
    }
    this.timer = setInterval(() => void this.sample(), SAMPLE_EVERY_MS)
  }

  /** Whether this side uploads on the link (the bitrate budget is shared between these). */
  get sendsMedia(): boolean {
    return this.opts.sends
  }

  /** `data-link-state` for the UI. */
  get state(): LinkState {
    return this.current
  }

  /** `data-receiving` for the UI: only what is both present and allowed by the server's view. */
  get receiving(): Receiving {
    const a = !!this.remote.audio && this.allowed.audio
    const v = !!this.remote.video && this.allowed.video
    return a && v ? 'audio-video' : a ? 'audio' : v ? 'video' : 'none'
  }

  /** The remote tracks, for the tile's `<audio>` and `<video>` elements. */
  get remoteTracks(): Readonly<Record<Kind, MediaStreamTrack | null>> {
    return this.remote
  }

  private get direction(): RTCRtpTransceiverDirection {
    return this.opts.sends && this.opts.receives ? 'sendrecv' : this.opts.sends ? 'sendonly' : 'recvonly'
  }

  /** Offerer only: opens the link. */
  async offer(): Promise<void> {
    if (this.role !== 'offerer') return
    this.peer.addTransceiver('audio', { direction: this.direction })
    this.peer.addTransceiver('video', { direction: this.direction })
    this.applyTracks()
    await this.negotiate(false)
  }

  private async negotiate(iceRestart: boolean) {
    try {
      const offer = await this.peer.createOffer(iceRestart ? { iceRestart: true } : undefined)
      await this.peer.setLocalDescription(offer)
      if (this.current !== 'closed' && offer.sdp) this.opts.send('offer', this.linkId, offer.sdp)
      void this.applyBitrate()
    } catch {
      this.fail()
    }
  }

  /**
   * One signalling message for this link. Returns false when it was discarded: another `linkId`, a closed link, a
   * message that makes no sense for this side (an offer to the offerer, which is how glare is dropped).
   */
  async receive(kind: SignalKind, linkId: string, payload: string): Promise<boolean> {
    if (this.current === 'closed' || linkId !== this.linkId) return false
    try {
      if (kind === 'offer') {
        if (this.role !== 'answerer') return false
        await this.peer.setRemoteDescription({ type: 'offer', sdp: payload })
        for (const t of this.peer.getTransceivers()) t.direction = this.direction
        this.applyTracks()
        await this.flushIce()
        const answer = await this.peer.createAnswer()
        await this.peer.setLocalDescription(answer)
        if (answer.sdp) this.opts.send('answer', this.linkId, answer.sdp)
        void this.applyBitrate()
        return true
      }
      if (kind === 'answer') {
        if (this.role !== 'offerer' || this.peer.signalingState !== 'have-local-offer') return false
        await this.peer.setRemoteDescription({ type: 'answer', sdp: payload })
        await this.flushIce()
        return true
      }
      if (!payload) return true // end of candidates
      const candidate = JSON.parse(payload) as RTCIceCandidateInit
      if (this.peer.remoteDescription) await this.peer.addIceCandidate(candidate)
      else this.pendingIce.push(candidate)
      return true
    } catch {
      this.fail()
      return false
    }
  }

  private async flushIce() {
    const queued = this.pendingIce
    this.pendingIce = []
    for (const c of queued) await this.peer.addIceCandidate(c)
  }

  private onIceState() {
    const s = this.peer.iceConnectionState
    if (this.current === 'closed') return
    if (s === 'connected' || s === 'completed') {
      this.setState(this.current === 'weak' ? 'weak' : 'connected')
    } else if (s === 'failed') {
      this.failures += 1
      // One ICE restart, offered by the side that offered first; the other side waits for it.
      if (this.failures === 1) {
        if (this.role === 'offerer') void this.negotiate(true)
      } else this.fail()
    }
  }

  private fail() {
    if (this.current !== 'closed') this.setState('failed')
  }

  /** Starts (track) or stops (null) sending a kind. The caller owns the track and stops it. */
  setTrack(kind: Kind, track: MediaStreamTrack | null) {
    this.tracks[kind] = track
    this.applyTracks()
  }

  private sender(kind: Kind): RTCRtpSender | undefined {
    return this.peer.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender
  }

  private applyTracks() {
    if (!this.opts.sends) return
    for (const kind of ['audio', 'video'] as const) {
      // On a weak link the video stays off while audio goes on.
      const track = kind === 'video' && this.current === 'weak' ? null : this.tracks[kind]
      void this.sender(kind)?.replaceTrack(track).catch(() => undefined)
    }
  }

  /** The server's view decides what plays: audio only while on stage, unmuted and on; video only while video is on. */
  setPlayback(allowed: Record<Kind, boolean>) {
    this.allowed = { ...allowed }
    for (const kind of ['audio', 'video'] as const) {
      const t = this.remote[kind]
      if (t) t.enabled = allowed[kind]
    }
    this.changed()
  }

  setVideoBitrate(bps: number) {
    this.bitrate = bps
    void this.applyBitrate()
  }

  private async applyBitrate() {
    if (!this.opts.sends || !this.bitrate) return
    try {
      const sender = this.sender('video')
      if (!sender) return
      const p = sender.getParameters()
      if (!p.encodings?.length) p.encodings = [{}]
      p.encodings[0]!.maxBitrate = this.bitrate
      await sender.setParameters(p)
    } catch {
      // A browser that refuses simply keeps its own estimate.
    }
  }

  /** Reads `getStats()` once; the timer calls it every 3 s. */
  async sample(): Promise<void> {
    if (this.current === 'closed' || this.current === 'failed' || !this.opts.sends) return
    let lost = 0
    let received = 0
    let rtt = 0
    try {
      const report = await this.peer.getStats()
      report.forEach((s: Record<string, unknown>) => {
        if (s.type === 'remote-inbound-rtp') {
          lost += Number(s.packetsLost ?? 0)
          if (typeof s.roundTripTime === 'number') rtt = Math.max(rtt, s.roundTripTime * 1000)
        } else if (s.type === 'candidate-pair' && s.nominated && typeof s.currentRoundTripTime === 'number') {
          rtt = Math.max(rtt, s.currentRoundTripTime * 1000)
        }
        // What the other side reports back is the loss on what we send.
        if (s.type === 'remote-inbound-rtp') received += Number(s.packetsReceived ?? 0)
      })
    } catch {
      return
    }
    const prev = this.last
    this.last = { lost, received }
    const dLost = lost - (prev?.lost ?? 0)
    const dRecv = received - (prev?.received ?? 0)
    const total = dLost + dRecv
    const loss = prev && total > 0 ? dLost / total : 0
    if (loss > WEAK_LOSS || rtt > WEAK_RTT_MS) {
      this.good = 0
      this.bad += 1
      if (this.bad >= WEAK_SAMPLES && this.current === 'connected') {
        this.setState('weak')
        this.applyTracks()
      }
    } else {
      this.bad = 0
      this.good += 1
      if (this.good >= RECOVER_SAMPLES && this.current === 'weak') {
        this.setState('connected')
        this.applyTracks()
      }
    }
  }

  private setState(next: LinkState) {
    if (this.current === next) return
    this.current = next
    this.changed()
  }

  private changed() {
    this.opts.onChange?.()
  }

  /** Stops the timer and closes the connection. Tracks belong to the caller and are not stopped here. */
  close() {
    if (this.current === 'closed') return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.current = 'closed'
    this.peer.onicecandidate = null
    this.peer.oniceconnectionstatechange = null
    this.peer.ontrack = null
    for (const kind of ['audio', 'video'] as const) void this.sender(kind)?.replaceTrack(null).catch(() => undefined)
    this.remote = { audio: null, video: null }
    this.peer.close()
    this.changed()
  }
}
