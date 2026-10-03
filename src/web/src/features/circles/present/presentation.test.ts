import { isNewer, type PresentationState } from './presentation'

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
