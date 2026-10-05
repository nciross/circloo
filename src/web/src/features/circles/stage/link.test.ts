import { PeerLink, RECOVER_SAMPLES, RESTART_WAIT_MS, SAMPLE_EVERY_MS, type LinkOptions } from './link'
import { asPeer, asTrack, FakePeer, FakeTrack } from './fakes'

type Sent = { kind: string; linkId: string; payload: string }

function make(over: Partial<LinkOptions> & { role?: 'offerer' | 'answerer' } = {}) {
  const peer = new FakePeer({})
  const sent: Sent[] = []
  const link = new PeerLink({
    peer: asPeer(peer),
    remoteId: 'r',
    role: 'offerer',
    linkId: 'L1',
    sends: true,
    receives: true,
    send: (kind, linkId, payload) => sent.push({ kind, linkId, payload }),
    ...over,
  })
  return { peer, sent, link }
}

/** Remote loss and round trip as the browser reports them for what we send. */
const stats = (peer: FakePeer, lost: number, received: number, rttSeconds = 0.05) => {
  peer.stats = [{ type: 'remote-inbound-rtp', packetsLost: lost, packetsReceived: received, roundTripTime: rttSeconds }]
}

afterEach(() => {
  vi.useRealTimers()
  FakePeer.all = []
})

describe('offer and answer', () => {
  it('the offerer adds both transceivers up front and sends one offer with its linkId', async () => {
    const { peer, sent, link } = make()
    await link.offer()
    expect(peer.transceivers.map((t) => [t.kind, t.direction])).toEqual([['audio', 'sendrecv'], ['video', 'sendrecv']])
    expect(sent).toEqual([{ kind: 'offer', linkId: 'L1', payload: 'v=0 offer' }])
  })

  it('a viewer link is receive only on the viewer and send only on the stage side', async () => {
    const viewer = make({ sends: false, receives: true })
    await viewer.link.offer()
    expect(viewer.peer.transceivers.every((t) => t.direction === 'recvonly')).toBe(true)
    const stage = make({ role: 'answerer', sends: true, receives: false })
    await stage.link.receive('offer', 'L1', 'v=0 offer')
    expect(stage.peer.transceivers.every((t) => t.direction === 'sendonly')).toBe(true)
    expect(stage.sent[0]?.kind).toBe('answer')
  })

  it('the answerer answers an offer and the offerer takes the answer', async () => {
    const a = make({ role: 'answerer' })
    expect(await a.link.receive('offer', 'L1', 'v=0 offer')).toBe(true)
    expect(a.sent).toEqual([{ kind: 'answer', linkId: 'L1', payload: 'v=0 answer' }])
    const o = make()
    await o.link.offer()
    expect(await o.link.receive('answer', 'L1', 'v=0 answer')).toBe(true)
    expect(o.peer.remoteDescription?.type).toBe('answer')
  })

  it('sends local candidates as ICE messages and queues remote ones until the description is set', async () => {
    const { peer, sent, link } = make()
    await link.offer()
    peer.candidate({ candidate: 'x' })
    expect(sent.at(-1)).toEqual({ kind: 'ice', linkId: 'L1', payload: JSON.stringify({ candidate: 'x' }) })
    await link.receive('ice', 'L1', JSON.stringify({ candidate: 'early' }))
    expect(peer.candidates).toEqual([])
    await link.receive('answer', 'L1', 'v=0 answer')
    expect(peer.candidates).toEqual([{ candidate: 'early' }])
    await link.receive('ice', 'L1', JSON.stringify({ candidate: 'late' }))
    expect(peer.candidates).toHaveLength(2)
  })
})

describe('glare and stale messages', () => {
  it('the offerer drops an offer from the other side, so two offers never cross', async () => {
    const { peer, sent, link } = make()
    await link.offer()
    expect(await link.receive('offer', 'L1', 'v=0 theirs')).toBe(false)
    expect(peer.remoteDescription).toBeNull()
    expect(sent.map((m) => m.kind)).toEqual(['offer'])
  })

  it('discards messages with another linkId and everything after close', async () => {
    const { peer, link } = make()
    await link.offer()
    expect(await link.receive('answer', 'OLD', 'v=0 answer')).toBe(false)
    expect(await link.receive('ice', 'OLD', '{}')).toBe(false)
    expect(peer.remoteDescription).toBeNull()
    link.close()
    expect(await link.receive('answer', 'L1', 'v=0 answer')).toBe(false)
  })

  it('drops an ICE message that is not a candidate object without failing the link', async () => {
    const { peer, link } = make()
    await link.offer()
    for (const bad of ['null', '[1]', '"x"', '42']) expect(await link.receive('ice', 'L1', bad)).toBe(false)
    expect(await link.receive('bogus' as 'ice', 'L1', '{}')).toBe(false)
    expect(peer.candidates).toEqual([])
    expect(link.state).toBe('connecting')
  })

  it('ignores an answer when no offer is waiting', async () => {
    const { link } = make()
    expect(await link.receive('answer', 'L1', 'v=0 answer')).toBe(false)
  })
})

describe('tracks', () => {
  it('starts and stops the microphone and camera with replaceTrack, never renegotiating', async () => {
    const { peer, link } = make()
    await link.offer()
    const mic = new FakeTrack('audio')
    link.setTrack('audio', asTrack(mic))
    expect(peer.audio()?.sender.track).toBe(mic)
    expect(peer.video()?.sender.track).toBeNull()
    link.setTrack('audio', null)
    expect(peer.audio()?.sender.track).toBeNull()
    expect(peer.offers).toHaveLength(1)
  })

  it('only lets remote media through when the playback gate allows it', async () => {
    const { link } = make()
    await link.offer()
    await link.receive('answer', 'L1', 'v=0 answer')
    expect(link.receiving).toBe('none')
    link.setPlayback({ audio: true, video: false })
    expect(link.receiving).toBe('audio')
    expect(link.remoteTracks.audio?.enabled).toBe(true)
    expect(link.remoteTracks.video?.enabled).toBe(false)
    link.setPlayback({ audio: true, video: true })
    expect(link.receiving).toBe('audio-video')
    link.setPlayback({ audio: false, video: false })
    expect(link.receiving).toBe('none')
  })

  it('caps the video bitrate', async () => {
    const { peer, link } = make({ videoBitrate: 300_000 })
    await link.offer()
    expect(peer.video()?.sender.params.encodings[0]?.maxBitrate).toBe(300_000)
    link.setVideoBitrate(150_000)
    await Promise.resolve()
    expect(peer.video()?.sender.params.encodings[0]?.maxBitrate).toBe(150_000)
  })
})

describe('ICE restart', () => {
  it('connects, then restarts once on failure and gives up on the second', async () => {
    const { peer, sent, link } = make()
    await link.offer()
    peer.iceState('connected')
    expect(link.state).toBe('connected')
    peer.iceState('failed')
    await vi.waitFor(() => expect(sent.filter((m) => m.kind === 'offer')).toHaveLength(2))
    expect(peer.offers[1]).toEqual({ iceRestart: true })
    expect(sent.filter((m) => m.kind === 'offer').map((m) => m.linkId)).toEqual(['L1', 'L1'])
    expect(link.state).toBe('connected')
    peer.iceState('failed')
    expect(link.state).toBe('failed')
    expect(peer.offers).toHaveLength(2)
  })

  it('the answerer waits for the offerer restart instead of offering', async () => {
    const { peer, link } = make({ role: 'answerer' })
    await link.receive('offer', 'L1', 'v=0 offer')
    peer.iceState('failed')
    expect(peer.offers).toHaveLength(0)
    expect(link.state).toBe('connecting')
    expect(await link.receive('offer', 'L1', 'v=0 restart')).toBe(true)
  })

  it('fails when the restart never connects, so the link does not hold a slot forever', async () => {
    vi.useFakeTimers()
    const { peer, link } = make({ role: 'answerer' })
    await link.receive('offer', 'L1', 'v=0 offer')
    peer.iceState('connected')
    peer.iceState('failed')
    await vi.advanceTimersByTimeAsync(RESTART_WAIT_MS - 1)
    expect(link.state).toBe('connected')
    await vi.advanceTimersByTimeAsync(1)
    expect(link.state).toBe('failed')
  })

  it('a restart that connects in time keeps the link', async () => {
    vi.useFakeTimers()
    const { peer, link } = make()
    await link.offer()
    peer.iceState('connected')
    peer.iceState('failed')
    peer.iceState('connected')
    await vi.advanceTimersByTimeAsync(RESTART_WAIT_MS)
    expect(link.state).toBe('connected')
  })
})

describe('weak link', () => {
  async function connected() {
    vi.useFakeTimers()
    const m = make()
    await m.link.offer()
    m.peer.iceState('connected')
    const cam = new FakeTrack('video')
    const mic = new FakeTrack('audio')
    m.link.setTrack('video', asTrack(cam))
    m.link.setTrack('audio', asTrack(mic))
    return { ...m, cam, mic }
  }
  const tick = () => vi.advanceTimersByTimeAsync(SAMPLE_EVERY_MS)

  it('drops the video after two bad samples and keeps the audio', async () => {
    const { peer, link, cam, mic } = await connected()
    stats(peer, 0, 100)
    await tick() // baseline
    stats(peer, 40, 160)
    await tick()
    expect(link.state).toBe('connected')
    stats(peer, 90, 210)
    await tick()
    expect(link.state).toBe('weak')
    expect(peer.video()?.sender.track).toBeNull()
    expect(peer.audio()?.sender.track).toBe(mic)
    expect(cam.stopped).toBe(false)
  })

  it('uses fractionLost when the browser does not report packetsReceived', async () => {
    const { peer, link } = await connected()
    peer.stats = [{ type: 'remote-inbound-rtp', packetsLost: 5, fractionLost: 0.02, roundTripTime: 0.05 }]
    await tick()
    peer.stats = [{ type: 'remote-inbound-rtp', packetsLost: 9, fractionLost: 0.03, roundTripTime: 0.05 }]
    await tick()
    await tick()
    expect(link.state).toBe('connected')
    peer.stats = [{ type: 'remote-inbound-rtp', packetsLost: 90, fractionLost: 0.3 }]
    await tick()
    await tick()
    expect(link.state).toBe('weak')
  })

  it('stays connected when the browser reports no stats at all', async () => {
    const { peer, link } = await connected()
    peer.stats = []
    for (let i = 0; i < 4; i++) await tick()
    expect(link.state).toBe('connected')
  })

  it('also counts a long round trip as weak', async () => {
    const { peer, link } = await connected()
    stats(peer, 0, 100, 0.9)
    await tick()
    await tick()
    expect(link.state).toBe('weak')
  })

  it('brings the video back after ten seconds of good samples', async () => {
    const { peer, link, cam } = await connected()
    stats(peer, 0, 100, 0.9)
    await tick()
    await tick()
    expect(link.state).toBe('weak')
    stats(peer, 0, 200, 0.05)
    for (let i = 0; i < RECOVER_SAMPLES - 1; i++) await tick()
    expect(link.state).toBe('weak')
    await tick()
    expect(link.state).toBe('connected')
    expect(peer.video()?.sender.track).toBe(cam)
  })
})

describe('teardown', () => {
  it('closes the connection, stops sampling, clears handlers and keeps tracks for their owner', async () => {
    vi.useFakeTimers()
    const { peer, link } = make()
    await link.offer()
    const mic = new FakeTrack('audio')
    link.setTrack('audio', asTrack(mic))
    link.close()
    expect(peer.closed).toBe(true)
    expect(link.state).toBe('closed')
    expect(peer.ontrack).toBeNull()
    expect(peer.audio()?.sender.track).toBeNull()
    expect(mic.stopped).toBe(false)
    stats(peer, 99, 1)
    await vi.advanceTimersByTimeAsync(SAMPLE_EVERY_MS * 3)
    expect(link.state).toBe('closed')
  })
})
