/**
 * The maths of the results reveal (spec 006 US5): kept pure, so the count-up, the time format and the confetti are
 * unit-tested without a browser.
 */

/** How long bars grow and numbers count up, in milliseconds. */
export const REVEAL_MS = 900

/** Ease-out cubic: fast at first, settling gently on the final value. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** The value shown `elapsed` ms into a count-up to `target` (whole numbers, never past the target). */
export function countUp(target: number, elapsed: number, duration = REVEAL_MS): number {
  if (duration <= 0 || elapsed >= duration) return target
  return Math.min(target, Math.round(target * easeOut(elapsed / duration)))
}

/** "2.4 s" in the reader's language: one decimal under a minute, whole seconds above. */
export function formatSeconds(ms: number, locale: string): string {
  const seconds = Math.max(0, ms) / 1000
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    maximumFractionDigits: seconds < 60 ? 1 : 0,
    minimumFractionDigits: seconds < 60 ? 1 : 0,
  }).format(seconds)
}

export interface Particle {
  /** Start position across the screen, 0–1 from the inline start. */
  x: number
  /** Horizontal drift over the burst, in screen widths (negative drifts toward the inline start). */
  drift: number
  /** Delay before it falls, 0–0.3 of the burst. */
  delay: number
  /** How far it falls, in screen heights. */
  fall: number
  size: number
  spin: number
  color: string
  shape: 'circle' | 'heart'
}

/** A small seeded generator, so a burst can be replayed in tests. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x1_0000_0000
  }
}

/** At most this many pieces: festive on a projector, light on a phone. */
export const MAX_PARTICLES = 80

/** The confetti burst: circles and a few hearts in the characters' colours. */
export function confetti(count: number, colors: readonly string[], random: () => number = Math.random): Particle[] {
  const n = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(count)))
  return Array.from({ length: n }, () => ({
    x: random(),
    drift: (random() - 0.5) * 0.3,
    delay: random() * 0.3,
    fall: 0.6 + random() * 0.5,
    size: 6 + random() * 8,
    spin: (random() - 0.5) * 720,
    color: colors[Math.floor(random() * colors.length)] ?? '#22b8cc',
    shape: random() < 0.15 ? 'heart' : 'circle',
  }))
}
