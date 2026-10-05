import type { IceConfig, Seat, SignalKind, StageView } from '../../../api/discussion'
import { MeshManager, MIN_LINK_VIDEO_BPS, MAX_LINK_VIDEO_BPS, UNKNOWN_OFFER_WAIT_MS } from './mesh'
import { asPeer, asTrack, FakePeer, FakeTrack } from './fakes'

const ICE: IceConfig = { iceServers: [{ urls: 'stun:stun.example:3478' }], ttlSeconds: 600 }

const seat = (memberId: string, over: Partial<Seat> = {}): Seat => ({ memberId, state: 'onStage', audioOn: true, videoOn: true, mutedByAnimator: false, ...over })
const view = (...seats: Seat[]): StageView => ({ seats, watching: 0 })

type Msg = { to: string; kind: SignalKind; linkId: string; payload: string }

/** A set of meshes whose signalling goes to each other (a fake hub). */
function network(limits = { stageMax: 8, listenersMax: 8 }) {
  const nodes = new Map<string, Node>()
  let ids = 0
  class Node {
    peers: FakePeer[] = []
    sent: Msg[] = []
    getIce = vi.fn(() => Promise.resolve(ICE))
    mesh: MeshManager
    constructor(id: string, deliver: boolean) {
      this.mesh = new MeshManager({
        selfId: id,
        createPeer: (c) => {
          const p = new FakePeer(c)
          this.peers.push(p)
          return asPeer(p)
        },
        getIce: this.getIce,
        send: (to, kind, linkId, payload) => {
          this.sent.push({ to, kind, linkId, payload })
          if (deliver) queueMicrotask(() => void nodes.get(to)?.mesh.receive(id, kind, linkId, payload))
        },
        limits: () => limits,
        newLinkId: () => `${id}-${++ids}`,
      })
    }
  }
  const node = (id: string, deliver = true) => {
    const n = new Node(id, deliver)
    nodes.set(id, n)
    return n
  }
  return { node }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  FakePeer.all = []
})

describe('who offers', () => {
  it('on the stage the smaller member id offers, the other waits (no glare)', async () => {
    const net = network()
    const a = net.node('a', false)
    const b = net.node('b', false)
    for (const n of [a, b]) {
      n.mesh.setMode('stage')
      n.mesh.apply(view(seat('a'), seat('b')))
    }
    await settle()
    expect(a.sent.map((m) => [m.to, m.kind])).toEqual([['b', 'offer']])
    expect(b.sent).toEqual([])
    expect(b.peers).toHaveLength(0)
  })

  it('a viewer offers to every person on stage and skips invitations', async () => {
    const net = network()
    const v = net.node('v', false)
    v.mesh.setMode('viewer')
    v.mesh.apply(view(seat('a'), seat('b'), seat('c', { state: 'invited' }), seat('d', { state: 'reconnecting' })))
    await settle()
    expect(v.sent.map((m) => m.to).sort()).toEqual(['a', 'b'])
    expect(v.peers.every((p) => p.transceivers.every((t) => t.direction === 'recvonly'))).toBe(true)
  })

  it('does nothing until the person is on the stage or watching', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.apply(view(seat('b')))
    a.mesh.setMode('stage')
    await settle()
    expect(a.sent).toEqual([])
    expect(a.getIce).not.toHaveBeenCalled()
  })
})

describe('offer, answer and ICE between two browsers', () => {
  it('connects a stage pair and carries candidates both ways', async () => {
    const net = network()
    const a = net.node('a')
    const b = net.node('b')
    for (const n of [a, b]) {
      n.mesh.setMode('stage')
      n.mesh.apply(view(seat('a'), seat('b')))
    }
    await settle()
    expect(a.sent.map((m) => m.kind)).toEqual(['offer'])
    expect(b.sent.map((m) => m.kind)).toEqual(['answer'])
    a.peers[0]?.candidate({ candidate: 'from-a' })
    b.peers[0]?.candidate({ candidate: 'from-b' })
    await settle()
    expect(b.peers[0]?.candidates).toEqual([{ candidate: 'from-a' }])
    expect(a.peers[0]?.candidates).toEqual([{ candidate: 'from-b' }])
    a.peers[0]?.iceState('connected')
    b.peers[0]?.iceState('connected')
    expect(a.mesh.snapshot()).toEqual([{ memberId: 'b', state: 'connected', receiving: 'audio-video' }])
    expect(b.mesh.snapshot()[0]?.state).toBe('connected')
  })

  it('a stage member answers a viewer, and nothing from the viewer plays', async () => {
    const net = network()
    const a = net.node('a')
    const v = net.node('v')
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a')))
    v.mesh.setMode('viewer')
    v.mesh.apply(view(seat('a')))
    await settle()
    await vi.advanceTimersByTimeAsync(UNKNOWN_OFFER_WAIT_MS)
    expect(a.sent.map((m) => [m.to, m.kind])).toEqual([['v', 'answer']])
    // The viewer offered receive-only, so the browser negotiates the answer to send-only.
    expect(v.peers[0]?.transceivers.every((t) => t.direction === 'recvonly')).toBe(true)
    expect(a.mesh.snapshot()).toEqual([{ memberId: 'v', state: 'connecting', receiving: 'none' }])
  })

  it('fetches the ICE servers on first use only, with the server list', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a')))
    expect(a.getIce).not.toHaveBeenCalled()
    a.mesh.apply(view(seat('a'), seat('b'), seat('c')))
    await settle()
    expect(a.getIce).toHaveBeenCalledTimes(1)
    expect(a.peers.map((p) => p.config)).toEqual([{ iceServers: ICE.iceServers }, { iceServers: ICE.iceServers }])
  })
})

describe('glare and stale links', () => {
  it('drops an offer from someone this side offers to, and answers nobody', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    await a.mesh.receive('b', 'offer', 'theirs', 'v=0 x')
    await settle()
    expect(a.sent.map((m) => m.kind)).toEqual(['offer'])
    expect(a.peers).toHaveLength(1)
  })

  it('ignores an offer from a seated member who should be the answerer of the pair', async () => {
    const net = network()
    const b = net.node('b', false)
    b.mesh.setMode('stage')
    b.mesh.apply(view(seat('a'), seat('b'), seat('c')))
    await settle()
    // c is greater than b, so b is the offerer to c: an offer from c is a glare.
    await b.mesh.receive('c', 'offer', 'c1', 'v=0 x')
    await settle()
    expect(b.sent.filter((m) => m.kind === 'answer')).toEqual([])
  })

  it('discards an answer or ICE for a link that was replaced', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    await a.mesh.receive('b', 'answer', 'stale-link', 'v=0 answer')
    await a.mesh.receive('b', 'ice', 'stale-link', '{"candidate":"x"}')
    expect(a.peers[0]?.remoteDescription).toBeNull()
    expect(a.peers[0]?.candidates).toEqual([])
  })

  it('replaces an answerer link when the other side reopens with a new linkId', async () => {
    const net = network()
    const b = net.node('b', false)
    b.mesh.setMode('stage')
    b.mesh.apply(view(seat('a'), seat('b')))
    await b.mesh.receive('a', 'offer', 'first', 'v=0 x')
    await settle()
    await b.mesh.receive('a', 'offer', 'second', 'v=0 y')
    await settle()
    expect(b.peers).toHaveLength(2)
    expect(b.peers[0]?.closed).toBe(true)
    expect(b.mesh.link('a')?.linkId).toBe('second')
  })

  it('waits for the Stage view when an offer comes from a seat it does not list yet', async () => {
    const net = network()
    const b = net.node('b', false)
    b.mesh.setMode('stage')
    b.mesh.apply(view(seat('b')))
    await b.mesh.receive('a', 'offer', 'L', 'v=0 x')
    await b.mesh.receive('a', 'ice', 'L', '{"candidate":"early"}')
    expect(b.sent).toEqual([])
    b.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    expect(b.sent.map((m) => m.kind)).toEqual(['answer'])
    expect(b.peers[0]?.config).toEqual({ iceServers: ICE.iceServers })
    expect(b.peers[0]?.candidates).toEqual([{ candidate: 'early' }])
    // The link is shaped for a stage peer (both ways), not as a viewer's.
    expect(b.peers[0]?.transceivers.every((t) => t.direction === 'sendrecv')).toBe(true)
  })

  it('a viewer never answers offers', async () => {
    const net = network()
    const v = net.node('v', false)
    v.mesh.setMode('viewer')
    v.mesh.apply(view(seat('a')))
    await settle()
    await v.mesh.receive('a', 'offer', 'L', 'v=0 x')
    await settle()
    expect(v.sent.map((m) => m.kind)).toEqual(['offer'])
  })
})

describe('the server view rules', () => {
  const connect = async () => {
    const net = network()
    const a = net.node('a')
    const b = net.node('b')
    for (const n of [a, b]) n.mesh.setMode('stage')
    const v = view(seat('a'), seat('b'))
    a.mesh.apply(v)
    b.mesh.apply(v)
    await settle()
    return { a, b }
  }

  it('closes the link to anyone the view no longer lists', async () => {
    const { a } = await connect()
    a.mesh.apply(view(seat('a')))
    expect(a.peers[0]?.closed).toBe(true)
    expect(a.mesh.snapshot()).toEqual([])
  })

  it('closes every link when your own seat is gone', async () => {
    const { a } = await connect()
    a.mesh.apply(view(seat('b')))
    expect(a.mesh.snapshot()).toEqual([])
  })

  it('plays remote audio only while on stage, not muted and with audio on, video only with video on', async () => {
    const { a } = await connect()
    const receiving = () => a.mesh.snapshot()[0]?.receiving
    expect(receiving()).toBe('audio-video')
    a.mesh.apply(view(seat('a'), seat('b', { audioOn: false })))
    expect(receiving()).toBe('video')
    a.mesh.apply(view(seat('a'), seat('b', { audioOn: true, mutedByAnimator: true })))
    expect(receiving()).toBe('video')
    a.mesh.apply(view(seat('a'), seat('b', { videoOn: false })))
    expect(receiving()).toBe('audio')
    a.mesh.apply(view(seat('a'), seat('b', { state: 'reconnecting' })))
    expect(receiving()).toBe('none')
    expect(a.peers[0]?.transceivers.every((t) => !t.receiver.track.enabled)).toBe(true)
  })
})

describe('limits', () => {
  it('opens at most stageMax - 1 links from the stage', async () => {
    const net = network({ stageMax: 3, listenersMax: 8 })
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b'), seat('c'), seat('d'), seat('e')))
    await settle()
    expect(a.sent.map((m) => m.to)).toEqual(['b', 'c'])
  })

  it('answers viewers only up to listenersMax and drops the rest', async () => {
    const net = network({ stageMax: 8, listenersMax: 2 })
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a')))
    for (const v of ['v1', 'v2', 'v3']) await a.mesh.receive(v, 'offer', `L-${v}`, 'v=0 x')
    await vi.advanceTimersByTimeAsync(UNKNOWN_OFFER_WAIT_MS)
    expect(a.sent.filter((m) => m.kind === 'answer').map((m) => m.to)).toEqual(['v1', 'v2'])
  })

  it('answers no viewer when listeners are switched off (0)', async () => {
    const net = network({ stageMax: 8, listenersMax: 0 })
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a')))
    await a.mesh.receive('v1', 'offer', 'L', 'v=0 x')
    await vi.advanceTimersByTimeAsync(UNKNOWN_OFFER_WAIT_MS)
    expect(a.sent).toEqual([])
  })

  it('shares the upload budget between the links, within the floor and the ceiling', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    const bps = (i: number) => a.peers[i]?.video()?.sender.params.encodings[0]?.maxBitrate
    expect(bps(0)).toBe(MAX_LINK_VIDEO_BPS)
    a.mesh.apply(view(seat('a'), seat('b'), seat('c'), seat('d'), seat('e'), seat('f'), seat('g'), seat('h')))
    await settle()
    expect(bps(0)).toBe(Math.floor(1_200_000 / 7))
    expect(bps(0)).toBeGreaterThanOrEqual(MIN_LINK_VIDEO_BPS)
  })
})

describe('tracks and teardown', () => {
  it('sends a track on every link, also on links opened later, and stops a replaced one', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    const mic = new FakeTrack('audio')
    a.mesh.setLocalTrack('audio', asTrack(mic))
    expect(a.peers[0]?.audio()?.sender.track).toBe(mic)
    a.mesh.apply(view(seat('a'), seat('b'), seat('c')))
    await settle()
    expect(a.peers[1]?.audio()?.sender.track).toBe(mic)
    const mic2 = new FakeTrack('audio')
    a.mesh.setLocalTrack('audio', asTrack(mic2))
    expect(mic.stopped).toBe(true)
    a.mesh.setLocalTrack('audio', null)
    expect(mic2.stopped).toBe(true)
    expect(a.peers[0]?.audio()?.sender.track).toBeNull()
  })

  it('close() closes every connection, stops every track and ignores later input', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b'), seat('c')))
    await settle()
    const cam = new FakeTrack('video')
    a.mesh.setLocalTrack('video', asTrack(cam))
    a.mesh.close()
    expect(a.peers.every((p) => p.closed)).toBe(true)
    expect(cam.stopped).toBe(true)
    expect(a.mesh.snapshot()).toEqual([])
    a.mesh.apply(view(seat('a'), seat('d')))
    await settle()
    expect(a.peers).toHaveLength(2)
  })

  it('a device that opens after close() is stopped at once', () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.close()
    const cam = new FakeTrack('video')
    a.mesh.setLocalTrack('video', asTrack(cam))
    expect(cam.stopped).toBe(true)
    expect(a.mesh.hasTrack('video')).toBe(false)
  })

  it('a failed link this side offered is opened again with a new linkId on the next view', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    a.peers[0]?.iceState('failed')
    a.peers[0]?.iceState('failed')
    expect(a.mesh.snapshot()[0]?.state).toBe('failed')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    expect(a.peers[0]?.closed).toBe(true)
    expect(a.peers).toHaveLength(2)
    const offers = a.sent.filter((m) => m.kind === 'offer' && m.to === 'b').map((m) => m.linkId)
    expect(new Set(offers).size).toBe(2)
  })

  it('reset() closes the links but keeps the devices for a rejoin', async () => {
    const net = network()
    const a = net.node('a', false)
    a.mesh.setMode('stage')
    a.mesh.apply(view(seat('a'), seat('b')))
    await settle()
    const mic = new FakeTrack('audio')
    a.mesh.setLocalTrack('audio', asTrack(mic))
    a.mesh.reset()
    expect(a.peers[0]?.closed).toBe(true)
    expect(mic.stopped).toBe(false)
  })
})
