import type { DiscussionState } from '../../../api/circles'
import type { Seat, StageView } from '../../../api/discussion'
import { asPeer, asTrack, FakePeer, FakeTrack } from './fakes'
import type { OpenedMedia } from './media'
import { bindStage, configureStage, resetStage, useStage, type StageDeps } from './stage'

const discussion = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const seat = (memberId: string, over: Partial<Seat> = {}): Seat => ({ memberId, state: 'onStage', audioOn: false, videoOn: false, mutedByAnimator: false, ...over })
const view = (...seats: Seat[]): StageView => ({ seats, watching: 2 })

type Handler = (...args: never[]) => void

function setup(over: Partial<StageDeps> = {}) {
  const calls: [string, ...unknown[]][] = []
  const refuse = new Set<string>()
  const handlers = new Map<string, Handler>()
  const tracks: FakeTrack[] = []
  const opened = (kinds: { audio?: boolean; video?: boolean }, problem: OpenedMedia['problem'] = null): OpenedMedia => {
    const mk = (k: 'audio' | 'video') => {
      const t = new FakeTrack(k)
      tracks.push(t)
      return asTrack(t)
    }
    return { audio: kinds.audio ? mk('audio') : null, video: kinds.video ? mk('video') : null, problem }
  }
  const deps: Partial<StageDeps> = {
    invoke: vi.fn((method: string, ...args: unknown[]) => {
      calls.push([method, ...args])
      return refuse.has(method) ? Promise.reject(new Error(`HubException: ${method} refused`)) : Promise.resolve()
    }),
    fetchIce: vi.fn(() => Promise.resolve({ iceServers: [], ttlSeconds: 600 })),
    createPeer: (c) => asPeer(new FakePeer(c)),
    openMedia: vi.fn((want) => Promise.resolve(opened({ audio: want.audio, video: want.video }))),
    ...over,
  }
  configureStage({ circleId: 'c1', selfId: 'me', deps })
  useStage.setState({ discussion: discussion() })
  const connection = { on: (name: string, h: Handler) => void handlers.set(name, h) }
  let current = true
  bindStage(connection, () => current)
  const fire = (name: string, ...args: unknown[]) => (handlers.get(name) as ((...a: unknown[]) => void) | undefined)?.(...args)
  return { deps, refuse, calls, tracks, fire, opened, stale: () => (current = false) }
}

const methods = (calls: [string, ...unknown[]][]) => calls.map((c) => c[0])

afterEach(() => {
  resetStage()
  FakePeer.all = []
})

describe('joining', () => {
  it('fetches the ICE servers, joins muted with the camera off, and asks for no device', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    expect(t.deps.fetchIce).toHaveBeenCalledWith('c1')
    expect(methods(t.calls)).toEqual(['JoinStage'])
    expect(useStage.getState().mode).toBe('stage')
    expect(useStage.getState().myMedia).toEqual({ audioOn: false, videoOn: false, problem: null })
    expect(t.deps.openMedia).not.toHaveBeenCalled()
  })

  it('stays out when the server refuses the seat', async () => {
    const t = setup({ invoke: vi.fn(() => Promise.reject(new Error('HubException: no-seat'))) })
    await expect(useStage.getState().joinStage()).rejects.toThrow('no-seat')
    expect(useStage.getState().mode).toBe('none')
    expect(t.deps.openMedia).not.toHaveBeenCalled()
  })

  it('watching registers a viewer and leaves media alone', async () => {
    const t = setup()
    await useStage.getState().watchStage()
    expect(methods(t.calls)).toEqual(['WatchStage'])
    expect(useStage.getState().mode).toBe('viewer')
    await useStage.getState().stopWatching()
    expect(methods(t.calls)).toEqual(['WatchStage', 'StopWatching'])
    expect(useStage.getState().mode).toBe('none')
  })

  it('does not reach the hub before the room configures it', async () => {
    resetStage()
    await expect(useStage.getState().giveFloor('x')).rejects.toThrow('offline')
  })
})

describe('devices', () => {
  it('turns the microphone on when asked and reports it, camera still off', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, false)
    expect(t.deps.openMedia).toHaveBeenCalledWith({ audio: true, video: false })
    expect(useStage.getState().myMedia).toEqual({ audioOn: true, videoOn: false, problem: null })
    expect(t.calls.at(-1)).toEqual(['SetMedia', true, false])
  })

  it('does not ask for a camera when the animator switched cameras off', async () => {
    const t = setup()
    useStage.setState({ discussion: discussion({ videoAllowed: false }) })
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, true)
    expect(t.deps.openMedia).toHaveBeenCalledWith({ audio: true, video: false })
    expect(t.calls.at(-1)).toEqual(['SetMedia', true, false])
  })

  it('falls back to audio only when the camera fails and keeps the reason', async () => {
    let t!: ReturnType<typeof setup>
    t = setup({ openMedia: vi.fn(() => Promise.resolve(t.opened({ audio: true }, 'no-device'))) })
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, true)
    expect(useStage.getState().myMedia).toEqual({ audioOn: true, videoOn: false, problem: 'no-device' })
  })

  it('a denied microphone leaves everything off and says why, without leaving the stage', async () => {
    const t = setup({ openMedia: vi.fn(() => Promise.resolve({ audio: null, video: null, problem: 'denied' as const })) })
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, false)
    expect(useStage.getState().myMedia).toEqual({ audioOn: false, videoOn: false, problem: 'denied' })
    expect(useStage.getState().mode).toBe('stage')
    expect(t.calls.at(-1)).toEqual(['SetMedia', false, false])
  })

  it('muting stops the microphone track', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, false)
    await useStage.getState().setMedia(false, false)
    expect(t.tracks[0]?.stopped).toBe(true)
    expect(useStage.getState().myMedia.audioOn).toBe(false)
  })

  it('switches everything off again when the server refuses the report', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.refuse.add('SetMedia')
    await expect(useStage.getState().setMedia(true, false)).rejects.toThrow('refused')
    expect(t.tracks[0]?.stopped).toBe(true)
    expect(useStage.getState().myMedia).toEqual({ audioOn: false, videoOn: false, problem: null })
  })
})

describe('hub events', () => {
  it('stores the discussion, the seats and the recording, ignoring a replaced connection', () => {
    const t = setup()
    t.fire('Discussion', discussion({ speaking: 'open' }))
    t.fire('Stage', view(seat('a')))
    t.fire('Recording', { id: 'r' })
    t.fire('RecordingWarning', 60)
    expect(useStage.getState()).toMatchObject({ discussion: { speaking: 'open' }, seats: [{ memberId: 'a' }], watching: 2, recording: { id: 'r' }, recordingWarning: 60 })
    t.fire('Recording', null)
    expect(useStage.getState().recordingWarning).toBeNull()
    t.stale()
    t.fire('Stage', view())
    expect(useStage.getState().seats).toHaveLength(1)
  })

  it('opens links to the seats of a Stage view once on stage', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.fire('Stage', view(seat('me'), seat('zz')))
    // "me" is smaller than "zz", so this side offers.
    await vi.waitFor(() => expect(t.calls.some((c) => c[0] === 'Signal' && c[1] === 'zz' && c[2] === 'offer')).toBe(true))
    expect(useStage.getState().links).toHaveLength(1)
  })

  it('a removed or ended seat stops the devices and closes the links at once, and queues a notice', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.fire('Stage', view(seat('me'), seat('zz')))
    await useStage.getState().setMedia(true, true)
    await vi.waitFor(() => expect(FakePeer.all.length).toBe(1))
    t.fire('StageNotice', 'removed', 'boss')
    expect(useStage.getState().mode).toBe('none')
    expect(useStage.getState().myMedia.audioOn).toBe(false)
    expect(t.tracks.every((x) => x.stopped)).toBe(true)
    expect(FakePeer.all.every((p) => p.closed)).toBe(true)
    expect(useStage.getState().announcements).toMatchObject([{ kind: 'removed', byMemberId: 'boss' }])
    const id = useStage.getState().announcements[0]?.id ?? 0
    useStage.getState().dismissAnnouncement(id)
    expect(useStage.getState().announcements).toEqual([])
  })

  it('a mute notice switches the microphone off but keeps the seat', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, false)
    t.fire('StageNotice', 'muted', 'boss')
    expect(useStage.getState().mode).toBe('stage')
    expect(useStage.getState().myMedia.audioOn).toBe(false)
    expect(t.tracks[0]?.stopped).toBe(true)
  })

  it('switching the discussion off tears down', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.fire('Discussion', discussion({ on: false }))
    expect(useStage.getState().mode).toBe('none')
  })

  it('routes a Signal to the mesh: an offer from a seat that should offer gets an answer', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.fire('Stage', view(seat('me'), seat('aa')))
    await vi.waitFor(() => expect(useStage.getState().mode).toBe('stage'))
    t.fire('Signal', 'aa', 'offer', 'L1', 'v=0 x')
    await vi.waitFor(() => expect(t.calls.some((c) => c[0] === 'Signal' && c[1] === 'aa' && c[2] === 'answer' && c[3] === 'L1')).toBe(true))
  })
})

describe('leaving and rejoining', () => {
  it('leaving releases the seat and tears down even when the call fails', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    await useStage.getState().setMedia(true, false)
    t.refuse.add('LeaveStage')
    await expect(useStage.getState().leaveStage()).rejects.toThrow()
    expect(useStage.getState().mode).toBe('none')
  })

  it('after a drop the seat is taken again, devices reported, links reopened from the next Stage view', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.fire('Stage', view(seat('me'), seat('zz')))
    await useStage.getState().setMedia(true, false)
    await vi.waitFor(() => expect(FakePeer.all.length).toBe(1))
    t.calls.length = 0
    await useStage.getState().rejoin()
    expect(methods(t.calls)).toContain('JoinStage')
    expect(t.calls.at(-1)).toEqual(['SetMedia', true, false])
    expect(FakePeer.all[0]?.closed).toBe(true)
    expect(t.tracks[0]?.stopped).toBe(false)
    await vi.waitFor(() => expect(FakePeer.all.length).toBe(2))
    expect(FakePeer.all[1]?.closed).toBe(false)
  })

  it('gives up locally if the seat cannot be taken again', async () => {
    const t = setup()
    await useStage.getState().joinStage()
    t.refuse.add('JoinStage')
    await useStage.getState().rejoin()
    expect(useStage.getState().mode).toBe('none')
  })
})

describe('animator actions', () => {
  it('call the hub methods of the contract', async () => {
    const t = setup()
    const s = useStage.getState()
    await s.enableDiscussion(false)
    await s.disableDiscussion()
    await s.giveFloor('m')
    await s.takeFloor('m')
    await s.removeFromStage('m')
    await s.muteMember('m')
    await s.allowUnmute('m')
    expect(t.calls).toEqual([
      ['EnableDiscussion', false],
      ['DisableDiscussion'],
      ['GiveFloor', 'm'],
      ['TakeFloor', 'm'],
      ['RemoveFromStage', 'm'],
      ['MuteMember', 'm'],
      ['AllowUnmute', 'm'],
    ])
  })
})
