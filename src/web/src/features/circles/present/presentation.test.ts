import { isNewer, receive, serverNow, useLive, type PresentationState } from './presentation'

const state = (sessionId: string, version: number, position = 0): PresentationState => ({
  sessionId, presentationName: 'Kickoff', position, count: 5, blank: false, phase: 'idle', serverNow: '2026-10-03T09:00:00Z', version,
  slide: { kind: 'deck', slideId: 's', image: '/api/slides/s/image' },
})

describe('isNewer', () => {
  it('takes the first state and any newer one of the same session', () => {
    expect(isNewer(state('a', 1), null)).toBe(true)
    expect(isNewer(state('a', 3, 2), state('a', 2, 1))).toBe(true)
  })
  it('drops an older state that arrives late', () => {
    expect(isNewer(state('a', 2, 1), state('a', 3, 2))).toBe(false)
  })
  it('takes a new session whatever its version', () => {
    expect(isNewer(state('b', 1), state('a', 9))).toBe(true)
  })
})

describe('receive', () => {
  afterEach(() => {
    vi.useRealTimers()
    useLive.getState().reset()
  })

  it('keeps the server clock so countdowns follow the server deadline, not the phone clock', () => {
    vi.useFakeTimers()
    // This phone is 90 seconds behind the server.
    vi.setSystemTime(new Date('2026-10-03T08:58:30Z'))
    receive(state('a', 1))
    expect(useLive.getState().skew).toBe(90_000)
    expect(new Date(serverNow()).toISOString()).toBe('2026-10-03T09:00:00.000Z')
  })

  it('takes a state of the same version again, as live poll results arrive with it', () => {
    receive(state('a', 4))
    const live = { ...state('a', 4), results: { total: 1, options: [{ id: 'a', count: 1, percent: 100, winner: true }] } }
    receive(live)
    expect(useLive.getState().state?.results?.total).toBe(1)
  })

  it('forgets everything, answers and counts included, when nothing is presented', () => {
    useLive.setState({ mine: { s: ['a'] }, count: { slideId: 's', answered: 1, of: 2, pending: [] } })
    receive(null)
    expect(useLive.getState()).toMatchObject({ state: null, mine: {}, count: null })
  })
})

describe('revealedLive', () => {
  afterEach(() => useLive.getState().reset())
  const question = (version: number, phase: PresentationState['phase']): PresentationState => ({
    ...state('a', version, 1),
    phase,
    slide: { kind: 'poll', slideId: 'q', question: 'Lunch?', options: [], multipleChoice: false, showFirst: true, showLive: false },
  })

  it('marks a reveal this page saw happen, so only that one plays', () => {
    receive(question(1, 'locked'))
    receive(question(2, 'revealed'))
    expect(useLive.getState().revealedLive).toBe('q')
  })

  it('does not replay results already revealed when landing on them', () => {
    receive(question(5, 'revealed'))
    expect(useLive.getState().revealedLive).toBeNull()
  })
})
