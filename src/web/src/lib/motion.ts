import { useReducedMotion as useReducedMotionBase, type Transition, type Variants } from 'motion/react'

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

/** True when the person asked for less motion. Components keep meaning (fades) and drop movement. */
export function useReducedMotion(): boolean {
  return useReducedMotionBase() ?? false
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
  hidden: { opacity: 0, y: reduced ? 0 : 8 },
  show: { opacity: 1, y: 0, transition: { duration: dur.enter, ease: easeOut } },
})

/** A panel or card entering: rises with the soft spring, or fades under reduced motion. */
export const enterVariants = (reduced: boolean): Variants => ({
  hidden: { opacity: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: dur.state } : spring.soft },
  exit: { opacity: 0, y: reduced ? 0 : 6, transition: { duration: dur.state } },
})

/** A count that went up pops once; under reduced motion it only brightens. */
export const popKeyframes = (reduced: boolean) =>
  reduced ? { opacity: [0.4, 1] } : { scale: [1, 1.12, 1] }
