/**
 * The peer mesh of the live discussion (spec 009 R2, R3, R4, R7).
 *
 * Stage to stage is a full mesh, a viewer opens one receive-only link to each stage member. The server's `Stage`
 * view decides who may be talked to and what plays: a remote person's audio plays only while their seat is on
 * stage, not muted and with audio on; their video only while video is on. Links to anyone the view no longer lists
 * are closed. Signalling goes through the injected `send`; this file never logs SDP, ICE or media.
 */
import type { IceConfig, Seat, SignalKind, StageView } from '../../../api/discussion'
import { PeerLink, type LinkState, type Receiving } from './link'

export type MeshMode = 'none' | 'stage' | 'viewer'

export interface MeshOptions {
  selfId: string
  createPeer: (config: RTCConfiguration) => RTCPeerConnection
  /** `GET /api/circles/{id}/discussion/ice`, called on first use only (and again once its ttl has passed). */
  getIce: () => Promise<IceConfig>
  /** Forwards one signalling message over the hub (`Signal`). Never to be logged. */
  send: (toMemberId: string, kind: SignalKind, linkId: string, payload: string) => void
  /** From the server's `Discussion` state. */
  limits: () => { stageMax: number; listenersMax: number }
  onChange?: () => void
  newLinkId?: () => string
  now?: () => number
}

/** Upload budget for all video links together (R2): shared between the links, never above 800 kbit/s per link. */
export const UPLOAD_BUDGET_BPS = 1_200_000
export const MAX_LINK_VIDEO_BPS = 800_000
export const MIN_LINK_VIDEO_BPS = 100_000
/** An offer from someone the Stage view does not list yet waits this long for the view before it counts as a viewer. */
export const UNKNOWN_OFFER_WAIT_MS = 1500

type Kind = 'audio' | 'video'
const ACTIVE = new Set<Seat['state']>(['onStage', 'reconnecting'])

interface Pending {
  linkId: string
  sdp: string
  ice: string[]
  timer: ReturnType<typeof setTimeout>
}

export class MeshManager {
  private mode: MeshMode = 'none'
  private view: StageView = { seats: [], watching: 0 }
  private readonly links = new Map<string, PeerLink>()
  private readonly opening = new Set<string>()
  private readonly pending = new Map<string, Pending>()
  private tracks: Record<Kind, MediaStreamTrack | null> = { audio: null, video: null }
  private ice: { config: IceConfig; at: number } | null = null
  private icePromise: Promise<IceConfig> | null = null
  private closed = false

  private readonly o: MeshOptions

  constructor(options: MeshOptions) {
    this.o = options
  }

  /** Starts the ICE fetch (first use) so a later link opens at once. Rejects if the server refuses. */
  async warmIce(): Promise<void> {
    await this.iceConfig()
  }

  private iceConfig(): Promise<IceConfig> {
    const now = (this.o.now ?? Date.now)()
    if (this.ice && now - this.ice.at < this.ice.config.ttlSeconds * 800) return Promise.resolve(this.ice.config)
    this.icePromise ??= this.o.getIce().then(
      (config) => {
        this.ice = { config, at: (this.o.now ?? Date.now)() }
        this.icePromise = null
        return config
      },
      (e: unknown) => {
        this.icePromise = null
        throw e
      },
    )
    return this.icePromise
  }

  setMode(mode: MeshMode) {
    if (mode === this.mode) return
    this.mode = mode
    this.dropPending()
    for (const id of [...this.links.keys()]) this.closeLink(id)
    this.apply(this.view)
  }

  /** Starts or stops sending a kind on every link. A replaced or removed track is stopped here. */
  setLocalTrack(kind: Kind, track: MediaStreamTrack | null) {
    const old = this.tracks[kind]
    this.tracks[kind] = track
    for (const l of this.links.values()) l.setTrack(kind, track)
    if (old && old !== track) old.stop()
  }

  hasTrack(kind: Kind): boolean {
    return this.tracks[kind] !== null
  }

  /** The state of every link, for `data-link-state` and `data-receiving`. */
  snapshot(): { memberId: string; state: LinkState; receiving: Receiving }[] {
    return [...this.links.values()].map((l) => ({ memberId: l.remoteId, state: l.state, receiving: l.receiving }))
  }

  link(memberId: string): PeerLink | undefined {
    return this.links.get(memberId)
  }

  private seat(id: string): Seat | undefined {
    return this.view.seats.find((s) => s.memberId === id)
  }

  /** Who this person must be linked to, given the server's Stage view. */
  private wanted(): string[] {
    const { stageMax } = this.o.limits()
    const others = this.view.seats.filter((s) => s.memberId !== this.o.selfId && ACTIVE.has(s.state))
    if (this.mode === 'viewer') return others.filter((s) => s.state === 'onStage').slice(0, stageMax).map((s) => s.memberId)
    if (this.mode === 'stage') {
      const me = this.seat(this.o.selfId)
      if (!me || !ACTIVE.has(me.state)) return []
      return others.slice(0, Math.max(stageMax - 1, 0)).map((s) => s.memberId)
    }
    return []
  }

  /** A new Stage view: close links to people no longer listed, open the ones that are missing, gate playback. */
  apply(view: StageView) {
    if (this.closed) return
    this.view = view
    const wanted = this.wanted()
    for (const [id, link] of [...this.links]) {
      // A viewer's incoming link to a stage member lives until it fails or the viewer closes it.
      const viewerLink = this.mode === 'stage' && !this.seat(id) && link.role !== 'offerer'
      if (!wanted.includes(id) && !viewerLink) this.closeLink(id)
    }
    for (const id of wanted) {
      if (this.links.has(id) || this.opening.has(id)) continue
      if (this.isOfferer(id)) void this.open(id)
    }
    for (const [id, p] of [...this.pending]) if (this.seat(id)) this.releasePending(id, p)
    this.gate()
    this.budget()
    this.o.onChange?.()
  }

  private isOfferer(remoteId: string): boolean {
    return this.mode === 'viewer' || this.o.selfId < remoteId
  }

  private async open(remoteId: string) {
    this.opening.add(remoteId)
    try {
      const config = await this.iceConfig()
      if (this.closed || !this.wanted().includes(remoteId) || this.links.has(remoteId)) return
      const link = this.make(remoteId, 'offerer', (this.o.newLinkId ?? (() => crypto.randomUUID()))(), config)
      await link.offer()
    } catch {
      // No ICE servers or no peer connection: the link is simply not there. The next view tries again.
    } finally {
      this.opening.delete(remoteId)
    }
  }

  private make(remoteId: string, role: 'offerer' | 'answerer', linkId: string, config: IceConfig): PeerLink {
    const viewerSide = this.mode === 'viewer'
    const stagePeer = !!this.seat(remoteId)
    const link = new PeerLink({
      peer: this.o.createPeer({ iceServers: config.iceServers }),
      remoteId,
      role,
      linkId,
      sends: !viewerSide,
      receives: viewerSide || stagePeer,
      send: (kind, id, payload) => this.o.send(remoteId, kind, id, payload),
      onChange: () => this.linkChanged(remoteId),
    })
    this.links.set(remoteId, link)
    for (const kind of ['audio', 'video'] as const) if (this.tracks[kind]) link.setTrack(kind, this.tracks[kind])
    this.gate()
    this.budget()
    return link
  }

  private linkChanged(remoteId: string) {
    const link = this.links.get(remoteId)
    // A failed link of someone who is no longer wanted (a viewer who left) is dropped.
    if (link?.state === 'failed' && !this.wanted().includes(remoteId)) this.closeLink(remoteId)
    this.o.onChange?.()
  }

  private closeLink(id: string) {
    const link = this.links.get(id)
    this.links.delete(id)
    link?.close()
  }

  /** Playback follows the server's view, not what the other browser claims (R4, R7). */
  private gate() {
    for (const [id, link] of this.links) {
      const s = this.seat(id)
      const on = !!s && s.state === 'onStage'
      link.setPlayback({ audio: on && s.audioOn && !s.mutedByAnimator, video: on && s.videoOn })
    }
  }

  private budget() {
    const senders = [...this.links.values()].filter((l) => l.sendsMedia).length
    if (!senders) return
    const each = Math.min(MAX_LINK_VIDEO_BPS, Math.max(MIN_LINK_VIDEO_BPS, Math.floor(UPLOAD_BUDGET_BPS / senders)))
    for (const l of this.links.values()) if (l.sendsMedia) l.setVideoBitrate(each)
  }

  /** One `Signal` from the hub. Anything that does not fit the current links is discarded. */
  async receive(fromId: string, kind: SignalKind, linkId: string, payload: string): Promise<void> {
    if (this.closed || this.mode === 'none') return
    const link = this.links.get(fromId)
    if (kind === 'offer') {
      // A viewer never answers; an offer to the offerer of the pair is a glare and is dropped.
      if (this.mode === 'viewer') return
      if (link && link.linkId === linkId) {
        await link.receive(kind, linkId, payload)
        return
      }
      if (link && link.role === 'offerer') return
      const seat = this.seat(fromId)
      if (seat) {
        if (!ACTIVE.has(seat.state) || this.isOfferer(fromId)) return
        await this.answer(fromId, linkId, payload, [])
        return
      }
      // Not listed (yet): either a viewer or a stage member whose seat the view has not shown us.
      this.hold(fromId, linkId, payload)
      return
    }
    if (link) {
      await link.receive(kind, linkId, payload)
      return
    }
    const p = this.pending.get(fromId)
    if (p && p.linkId === linkId && kind === 'ice' && p.ice.length < 100) p.ice.push(payload)
  }

  private canTakeViewer(): boolean {
    const viewers = [...this.links.values()].filter((l) => l.role === 'answerer' && !this.seat(l.remoteId)).length
    return viewers < this.o.limits().listenersMax
  }

  private hold(fromId: string, linkId: string, sdp: string) {
    const old = this.pending.get(fromId)
    if (old) clearTimeout(old.timer)
    const timer = setTimeout(() => {
      const p = this.pending.get(fromId)
      if (p) this.releasePending(fromId, p)
    }, UNKNOWN_OFFER_WAIT_MS)
    this.pending.set(fromId, { linkId, sdp, ice: old && old.linkId === linkId ? old.ice : [], timer })
  }

  private releasePending(id: string, p: Pending) {
    clearTimeout(p.timer)
    this.pending.delete(id)
    const seat = this.seat(id)
    if (this.mode !== 'stage' || !this.seat(this.o.selfId)) return
    if (seat) {
      if (!ACTIVE.has(seat.state) || this.isOfferer(id)) return
    } else if (!this.canTakeViewer()) return // listeners are full: the offer is dropped
    void this.answer(id, p.linkId, p.sdp, p.ice)
  }

  private async answer(fromId: string, linkId: string, sdp: string, ice: string[]) {
    try {
      const config = await this.iceConfig()
      if (this.closed || this.mode !== 'stage') return
      this.closeLink(fromId)
      const link = this.make(fromId, 'answerer', linkId, config)
      await link.receive('offer', linkId, sdp)
      for (const c of ice) await link.receive('ice', linkId, c)
    } catch {
      // As for open(): no link, the peer's own state shows it.
    }
  }

  private dropPending() {
    for (const p of this.pending.values()) clearTimeout(p.timer)
    this.pending.clear()
  }

  /** Closes every link, keeps the local tracks (the connection dropped; the person is rejoining). */
  reset() {
    this.dropPending()
    for (const id of [...this.links.keys()]) this.closeLink(id)
    this.o.onChange?.()
  }

  /** Full teardown: links closed, local tracks stopped. */
  close() {
    this.closed = true
    this.reset()
    this.setLocalTrack('audio', null)
    this.setLocalTrack('video', null)
  }
}
