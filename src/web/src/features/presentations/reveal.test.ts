import { confetti, countUp, formatSeconds, MAX_PARTICLES, REVEAL_MS, seeded } from './reveal'

describe('countUp', () => {
  it('starts at zero, ends on the target and never overshoots', () => {
    expect(countUp(42, 0)).toBe(0)
    expect(countUp(42, REVEAL_MS)).toBe(42)
    expect(countUp(42, REVEAL_MS * 3)).toBe(42)
    const values = [0, 100, 300, 600, 899].map((t) => countUp(42, t))
    expect(values).toEqual([...values].sort((a, b) => a - b))
    expect(Math.max(...values)).toBeLessThanOrEqual(42)
  })
  it('shows the final value at once without a duration (reduced motion)', () => {
    expect(countUp(7, 0, 0)).toBe(7)
  })
})

describe('formatSeconds', () => {
  it('writes the fastest answer with one decimal in the reader’s language', () => {
    expect(formatSeconds(2400, 'en')).toBe('2.4s')
    expect(formatSeconds(2400, 'fr')).toMatch(/^2,4\s?s$/)
    expect(formatSeconds(0, 'en')).toBe('0.0s')
  })
  it('drops the decimal past a minute', () => {
    expect(formatSeconds(75_400, 'en')).toBe('75s')
  })
})

describe('confetti', () => {
  it('stays within its budget and the given colours', () => {
    const burst = confetti(500, ['#ef4a32', '#22b8cc'], seeded(7))
    expect(burst).toHaveLength(MAX_PARTICLES)
    expect(new Set(burst.map((p) => p.color))).toEqual(new Set(['#ef4a32', '#22b8cc']))
    for (const p of burst) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(1)
      expect(p.delay).toBeLessThanOrEqual(0.3)
    }
  })
  it('replays the same burst from the same seed', () => {
    expect(confetti(10, ['#000'], seeded(3))).toEqual(confetti(10, ['#000'], seeded(3)))
  })
})
