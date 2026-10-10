import { useSyncExternalStore } from 'react'
import type { Transition, Variants } from 'motion/react'

/*
 * One motion grammar for the whole app (charte graphique, Motion section). Durations mirror the CSS
 * tokens in tokens.css; springs are the three presets every component picks from. Nothing bounces.
 */
export const dur = {
  press: 0.12,
  state: 0.16,
  move: 0.24,
  enter: 0.3,
  focal: 0.6,
  orbit: 1.2,
} as const

/** Exponential ease-out, the same curve as --ease-out. */
export const easeOut = [0.16, 1, 0.3, 1] as const
export const easeInOut = [0.65, 0, 0.35, 1] as const

export const spring = {
  /** A body hopping onto the ring, a vote dot, a chip. */
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 1 } satisfies Transition,
  /** Panels, sheets, the rail, cards rising. */
  soft: { type: 'spring', stiffness: 260, damping: 28, mass: 1 } satisfies Transition,
  /** A ring settling, the sky fill changing. */
  gentle: { type: 'spring', stiffness: 160, damping: 24, mass: 1.2 } satisfies Transition,
} as const

const REDUCE = '(prefers-reduced-motion: reduce)'
let watched: { matchMedia: typeof window.matchMedia; list: MediaQueryList } | null = null

/** The query for the current `matchMedia` (tests swap it), made once and kept. */
function reduceQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  if (watched?.matchMedia !== window.matchMedia) watched = { matchMedia: window.matchMedia, list: window.matchMedia(REDUCE) }
  return watched.list
}

function subscribeReduced(onChange: () => void) {
  const list = reduceQuery()
  if (!list) return () => {}
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }
  // Older Safari only knows addListener.
  list.addListener?.(onChange)
  return () => list.removeListener?.(onChange)
}

const reducedNow = () => reduceQuery()?.matches ?? false

/**
 * True when the person asked for less motion. Components keep meaning (fades) and drop movement. It follows the setting
 * live: switched on in the system while a call runs, the floats and the pops stop at once, with no reload (T914). The
 * `useReducedMotion` of `motion` reads it once per component and never again.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, reducedNow, () => false)
}

/** A list that appears as a list: rows rise 8px one after another, capped so long lists never wait. */
export const listVariants = (reduced: boolean, stagger = 0.03, cap = 0.24): Variants => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren: reduced ? 0 : stagger,
      delayChildren: (i: number) => Math.min(cap, i * (reduced ? 0 : stagger)),
      staggerDirection: 1,
    },
  },
})
export const rowVariants = (reduced: boolean): Variants => ({
  // Rows move into place, they never fade: text keeps its contrast while it settles (axe runs on arrival).
  hidden: { y: reduced ? 0 : 8 },
  show: { y: 0, transition: { duration: dur.enter, ease: easeOut } },
})

/** A panel or card entering: rises with the soft spring, or fades under reduced motion. */
export const enterVariants = (reduced: boolean): Variants => ({
  hidden: { y: reduced ? 0 : 12, scale: reduced ? 1 : 0.985 },
  show: { y: 0, scale: 1, transition: reduced ? { duration: dur.state } : spring.soft },
  exit: { opacity: 0, y: reduced ? 0 : 6, transition: { duration: dur.state } },
})

/** A count that went up pops once; under reduced motion it only brightens. */
export const popKeyframes = (reduced: boolean) =>
  reduced ? { opacity: [0.4, 1] } : { scale: [1, 1.12, 1] }
