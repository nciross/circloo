import { createContext, useContext } from 'react'
import { useReducedMotion } from '../../lib/motion'
import { useLandingMotion } from './motion'

/** The visitor's pause (`.site.is-still`), so entrances below the hero stay put as well. */
export const StillContext = createContext(false)

/** True when nothing on the page may move: the system asks for less, motion is off, or the visitor paused it. */
export function useStatic(): boolean {
  const still = useContext(StillContext)
  const { on } = useLandingMotion()
  const reduced = useReducedMotion()
  return still || !on || reduced
}
