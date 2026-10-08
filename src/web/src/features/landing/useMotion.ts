import { useCallback, useState } from 'react'
import { useLandingMotion } from './motion'

const STILL_KEY = 'circloo-landing-still'

/**
 * The visitor's "pause animations" choice for the landing (WCAG 2.2.2), remembered in this browser only.
 * Offered only while motion is on: either the system allows it or the visitor opted in to play it.
 */
export function useStillMotion() {
  const { on } = useLandingMotion()
  const [still, setStill] = useState(() => {
    try {
      return window.localStorage.getItem(STILL_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setStill((v) => {
      try {
        window.localStorage.setItem(STILL_KEY, v ? '0' : '1')
      } catch {
        /* storage blocked: the choice lasts for this visit */
      }
      return !v
    })
  }, [])
  return { still, toggle, offered: on }
}
