import type { DiscussionState } from '../../../api/circles'
import { ApiError } from '../../../api/client'
import type { CallPass } from '../../../api/discussion'
import { createCallEngine, type CallListener } from './call'
import { DisconnectReason, FakeRoom, RoomEvent, deviceFailures, fakeLiveKit, resetFakeLiveKit } from './livekit.fake'
import { bindStage, configureStage, resetStage, useStage, type StageDeps } from './stage'

const discussion = (over: Partial<DiscussionState> = {}): DiscussionState => ({ on: true, videoAllowed: true, speaking: 'hand', available: true, away: 'none', awayEndsAt: null, ...over })
const pass = (over: Partial<CallPass> = {}): CallPass => ({ url: 'ws://localhost:7880', token: 'pass', identity: 'me', expiresAt: '2026-10-09T10:05:00Z', canSpeak: true, canVideo: true, ...over })

type Handler = (...args: never[]) => void

function setup(over: Partial<StageDeps> = {}) {
  const calls: [string, ...unknown[]][] = []
  const handlers = new Map<string, Handler>()
  const deps = {
    invoke: vi.fn((method: string, ...args: unknown[]) => {
      calls.push([method, ...args])
      return Promise.resolve()
    }),
    fetchPass: vi.fn((_circleId: string) => Promise.resolve(pass())),
    createEngine: vi.fn((l: CallListener) => createCallEngine(l, { load: () => Promise.resolve(fakeLiveKit), phone: false })),
    ...over,
  }
  configureStage({ circleId: 'c1', deps })
  useStage.setState({ discussion: discussion() })
  const connection = { on: (name: string, h: Handler) => void handlers.set(name, h) }
  let current = true
  bindStage(connection, () => current)
  const fire = (name: string, ...args: unknown[]) => (handlers.get(name) as ((...a: unknown[]) => void) | undefined)?.(...args)
  return { deps, calls, fire, stale: () => (current = false) }
}

const state = () => useStage.getState()
const room = () => FakeRoom.last!
const domError = (name: string) => Object.assign(new Error(name), { name })

beforeAll(() => {
  // jsdom has no WebRTC; joining checks for it.
  vi.stubGlobal('RTCPeerConnection', class {})
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => Promise.reject(new Error('unused')) } })
})

afterEach(() => {
  resetStage()
  resetFakeLiveKit()
})

describe('joining', () => {
  it('loads nothing and fetches no pass until Join', async () => {
    const t = setup()
    t.fire('Discussion', discussion())
    t.fire('CallRoster', ['amina'])
    expect(t.deps.createEngine).not.toHaveBeenCalled()
    expect(t.deps.fetchPass).not.toHaveBeenCalled()
    expect(state().connection).toBe('idle')
  })

  it('fetches the pass once, connects, and joins with both devices off', async () => {
    const t = setup()
    await state().join()
    expect(t.deps.fetchPass).toHaveBeenCalledTimes(1)
    expect(t.deps.fetchPass).toHaveBeenCalledWith('c1')
    expect(t.deps.createEngine).toHaveBeenCalledTimes(1)
    expect(state()).toMatchObject({ connection: 'connected', error: null, me: { mic: false, camera: false }, myPermissions: { canSpeak: true, canVideo: true } })
    expect(room().audioStarts).toBe(1)
    expect(room().localParticipant.requests).toEqual([])
    // A second tap while in the call does nothing; a new join after leaving fetches a new pass.
    await state().join()
    expect(t.deps.fetchPass).toHaveBeenCalledTimes(1)
    await state().leave()
    await state().join()
    expect(t.deps.fetchPass).toHaveBeenCalledTimes(2)
  })

  it.each([
    [new ApiError(409, { type: 'call-off' }), 'call-off'],
    [new ApiError(403, { type: 'removed-from-call' }), 'removed-from-call'],
    [new ApiError(503, { type: 'calls-unavailable' }), 'calls-unavailable'],
    [new ApiError(503, { type: 'try-again' }), 'try-again'],
    [new ApiError(429, {}, 30), 'slow-down'],
    [new ApiError(500), 'try-again'],
  ])('fails kindly when the pass is refused (%s)', async (error, code) => {
    setup({ fetchPass: vi.fn(() => Promise.reject(error)) })
    await state().join()
    expect(state()).toMatchObject({ connection: 'failed', error: code, myPermissions: null })
  })

  it('says the call server is unreachable when connecting fails, and lets Join again work', async () => {
    const t = setup()
    FakeRoom.failConnect = true
    await state().join()
    expect(state()).toMatchObject({ connection: 'failed', error: 'unreachable' })
    expect(room().disconnected).toBe(true)
    await state().join()
    expect(state().connection).toBe('connected')
    expect(t.deps.fetchPass).toHaveBeenCalledTimes(2)
  })

  it('does not ask for a pass while the call is off, or without WebRTC', async () => {
    const t = setup()
    useStage.setState({ discussion: discussion({ on: false }) })
    await state().join()
    expect(state()).toMatchObject({ connection: 'failed', error: 'call-off' })
    useStage.setState({ discussion: discussion() })
    vi.stubGlobal('RTCPeerConnection', undefined)
    await state().join()
    expect(state().error).toBe('unsupported')
    vi.stubGlobal('RTCPeerConnection', class {})
    expect(t.deps.fetchPass).not.toHaveBeenCalled()
  })

  it('a leave during the join wins', async () => {
    let resolve!: (p: CallPass) => void
    setup({ fetchPass: vi.fn(() => new Promise<CallPass>((r) => (resolve = r))) })
    const joining = state().join()
    expect(state().connection).toBe('joining')
    await state().leave()
    resolve(pass())
    await joining
    expect(state().connection).toBe('idle')
    expect(room().connected).toBeNull()
    expect(room().disconnected).toBe(true)
  })
})

describe('devices', () => {
  it('switches the microphone and the camera on request only', async () => {
    setup()
    await state().join()
    await state().setMic(true)
    expect(state().me).toEqual({ mic: true, camera: false })
    await state().setCamera(true)
    expect(state().me).toEqual({ mic: true, camera: true })
    await state().setMic(false)
    expect(state().me).toEqual({ mic: false, camera: true })
  })

  it('permissions changed disables the microphone button: off now, and no request when pressed', async () => {
    setup()
    await state().join()
    await state().setMic(true)
    room().setPermissions([1])
    await vi.waitFor(() => expect(state().me.mic).toBe(false))
    expect(state().myPermissions).toEqual({ canSpeak: false, canVideo: true })
    await state().setMic(true)
    expect(room().localParticipant.requests).toEqual([['microphone', true]])
    // Given back: still off until the person switches it on.
    room().setPermissions([1, 2])
    expect(state().myPermissions?.canSpeak).toBe(true)
    expect(state().me.mic).toBe(false)
  })

  it('asks for no camera in an audio call', async () => {
    setup()
    useStage.setState({ discussion: discussion({ videoAllowed: false }) })
    await state().join()
    await state().setCamera(true)
    expect(room().localParticipant.requests).toEqual([])
  })

  it('maps device errors and stays in the call', async () => {
    setup()
    await state().join()
    deviceFailures.set('microphone', domError('NotAllowedError'))
    await state().setMic(true)
    expect(state()).toMatchObject({ connection: 'connected', deviceProblem: { kind: 'audio', problem: 'denied' }, me: { mic: false } })
    deviceFailures.set('camera', domError('NotFoundError'))
    await state().setCamera(true)
    expect(state().deviceProblem).toMatchObject({ kind: 'video', problem: 'no-device' })
    await state().setMic(true)
    expect(state()).toMatchObject({ deviceProblem: null, me: { mic: true } })
  })

  it('tells the same failure twice, and forgets it on Dismiss', async () => {
    setup()
    await state().join()
    deviceFailures.set('microphone', domError('NotAllowedError'))
    await state().setMic(true)
    const first = state().deviceProblem!
    deviceFailures.set('microphone', domError('NotAllowedError'))
    await state().setMic(true)
    expect(state().deviceProblem).toMatchObject({ kind: 'audio', problem: 'denied' })
    expect(state().deviceProblem!.id).not.toBe(first.id)
    state().dismissDeviceProblem()
    expect(state()).toMatchObject({ connection: 'connected', deviceProblem: null })
  })

  it('reports a browser that cannot use devices', async () => {
    setup()
    await state().join()
    const devices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    await state().setMic(true)
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: devices })
    expect(state().deviceProblem).toMatchObject({ kind: 'audio', problem: 'unsupported' })
    expect(room().localParticipant.requests).toEqual([])
  })
})

describe('connection states', () => {
  it('shows reconnecting, then connected again', async () => {
    setup()
    await state().join()
    room().emit(RoomEvent.Reconnecting)
    expect(state().connection).toBe('reconnecting')
    room().emit(RoomEvent.Reconnected)
    expect(state().connection).toBe('connected')
  })

  it('fails when the connection does not come back, with the tracks stopped', async () => {
    setup()
    await state().join()
    await state().setMic(true)
    const mic = room().localParticipant.getTrackPublication('microphone')!.track!
    room().emit(RoomEvent.Disconnected, DisconnectReason.SIGNAL_CLOSE)
    await vi.waitFor(() => expect(mic.stopped).toBe(true))
    expect(state()).toMatchObject({ connection: 'failed', error: 'lost', me: { mic: false, camera: false }, participants: [] })
  })

  it('goes back to idle when joined from another tab', async () => {
    setup()
    await state().join()
    room().emit(RoomEvent.Disconnected, DisconnectReason.DUPLICATE_IDENTITY)
    expect(state()).toMatchObject({ connection: 'idle', error: 'joined-elsewhere' })
  })

  it('leave stops the tracks and forgets the call; late events of that call change nothing', async () => {
    setup()
    await state().join()
    await state().setMic(true)
    await state().setCamera(true)
    const old = room()
    const tracks = [...old.localParticipant.trackPublications.values()].map((p) => p.track!)
    await state().leave()
    expect(old.disconnected).toBe(true)
    expect(tracks.every((t) => t.stopped)).toBe(true)
    expect(state()).toMatchObject({ connection: 'idle', me: { mic: false, camera: false }, myPermissions: null, participants: [] })
    old.emit(RoomEvent.Reconnecting)
    expect(state().connection).toBe('idle')
  })
})

describe('hub events', () => {
  it('keeps the discussion and the roster, and ignores a replaced connection', () => {
    const t = setup()
    t.fire('Discussion', discussion({ speaking: 'open' }))
    t.fire('CallRoster', ['a', 7, 'b'])
    expect(state()).toMatchObject({ discussion: { speaking: 'open' }, roster: ['a', 'b'] })
    t.fire('CallRoster', 'nope')
    expect(state().roster).toEqual(['a', 'b'])
    t.stale()
    t.fire('CallRoster', ['c'])
    expect(state().roster).toEqual(['a', 'b'])
  })

  it('records notices, drops unknown kinds, and dismisses', () => {
    const t = setup()
    t.fire('CallNotice', 'mic-muted', 'boss', 'me')
    t.fire('CallNotice', 'call-started', 'boss')
    t.fire('CallNotice', 'seat-moved', 'boss')
    expect(state().notices).toMatchObject([
      { kind: 'mic-muted', byMemberId: 'boss', subjectMemberId: 'me' },
      { kind: 'call-started', byMemberId: 'boss', subjectMemberId: null },
    ])
    state().dismissNotice(state().notices[0]!.id)
    expect(state().notices).toHaveLength(1)
  })

  it('a notice never switches a device on', async () => {
    const t = setup()
    await state().join()
    t.fire('CallNotice', 'mic-allowed', 'boss', 'me')
    t.fire('CallNotice', 'floor-given', 'boss', 'me')
    expect(room().localParticipant.requests).toEqual([])
  })

  it.each([
    ['removed', () => ['CallNotice', 'removed', 'boss', 'me']],
    ['call ended', () => ['CallNotice', 'call-ended']],
    ['call switched off', () => ['Discussion', discussion({ on: false })]],
  ])('leaves the call when %s', async (_, event) => {
    const t = setup()
    await state().join()
    await state().setMic(true)
    const old = room()
    const [name, ...args] = event() as [string, ...unknown[]]
    t.fire(name, ...args)
    await vi.waitFor(() => expect(old.disconnected).toBe(true))
    expect(state()).toMatchObject({ connection: 'idle', error: null, me: { mic: false } })
  })
})

describe('animator actions', () => {
  it('go through the hub with the contract names', async () => {
    const t = setup()
    const s = state()
    await s.enableDiscussion(false)
    await s.enableDiscussion(true, 'open')
    await s.disableDiscussion()
    await s.setSpeakingMode('open')
    await s.giveFloor('a')
    await s.takeFloor('a')
    await s.muteMember('a', 'microphone')
    await s.allowMember('a', 'camera')
    await s.muteEveryone()
    await s.removeFromCall('a')
    await s.allowBack('a')
    expect(t.calls).toEqual([
      ['EnableDiscussion', false, 'hand'],
      ['EnableDiscussion', true, 'open'],
      ['DisableDiscussion'],
      ['SetSpeakingMode', 'open'],
      ['GiveFloor', 'a'],
      ['LowerHand', 'a'],
      ['MuteMember', 'a', 'microphone'],
      ['AllowMember', 'a', 'camera'],
      ['MuteEveryone'],
      ['RemoveFromCall', 'a'],
      ['AllowBack', 'a'],
    ])
  })

  it('are refused offline until the room wires the hub', async () => {
    setup()
    resetStage()
    await expect(state().giveFloor('x')).rejects.toThrow('offline')
  })

  it('keep the mutes and removals this tab made, once the hub accepted them', async () => {
    setup()
    const s = state()
    await s.muteMember('amina', 'microphone')
    await s.muteMember('amina', 'microphone')
    await s.muteMember('theo', 'camera')
    await s.removeFromCall('lucia')
    expect(state().moderation).toEqual({ microphone: ['amina'], camera: ['theo'], removed: ['lucia'] })
    await s.allowMember('amina', 'microphone')
    await s.allowMember('theo', 'camera')
    await s.allowBack('lucia')
    expect(state().moderation).toEqual({ microphone: [], camera: [], removed: [] })
    // Mute everyone is a reset, not a lock: nothing to remember.
    await s.muteEveryone()
    expect(state().moderation).toEqual({ microphone: [], camera: [], removed: [] })
  })

  it('keep nothing the hub refused', async () => {
    setup({ invoke: vi.fn(() => Promise.reject(new Error('HubException: try-again'))) })
    await expect(state().muteMember('amina', 'microphone')).rejects.toThrow('try-again')
    await expect(state().removeFromCall('amina')).rejects.toThrow('try-again')
    expect(state().moderation).toEqual({ microphone: [], camera: [], removed: [] })
  })

  it('forget the mutes and removals when the call ends, as the server does', async () => {
    const t = setup()
    await state().muteMember('amina', 'microphone')
    await state().removeFromCall('theo')
    t.fire('Discussion', discussion({ videoAllowed: false }))
    expect(state().moderation.removed).toEqual(['theo'])
    t.fire('Discussion', discussion({ on: false }))
    expect(state().moderation).toEqual({ microphone: [], camera: [], removed: [] })
  })
})

describe('hands', () => {
  it('leaves the hands to the room store, the one place the Hands event lands (T927)', () => {
    const t = setup()
    t.fire('Hands', { queue: [{ memberId: 'amina', raisedAt: '2026-10-09T10:00:00Z' }], floor: 'theo' })
    expect(state()).not.toHaveProperty('hands')
  })
})
