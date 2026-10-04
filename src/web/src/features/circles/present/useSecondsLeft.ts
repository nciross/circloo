import { useEffect, useState } from 'react'
import { serverNow } from './presentation'

const secondsUntil = (end: number) => Math.max(0, Math.ceil((end - serverNow()) / 1000))

/**
 * Whole seconds left until a quiz deadline, on the server's clock (contracts/hub.md `serverNow`): a phone whose clock
 * is a minute off still counts down with everyone else. It checks a few times a second so it never skips a number,
 * re-renders only when the number changes, and stops at zero.
 */
export function useSecondsLeft(deadline: string | null | undefined): number | null {
  const end = deadline ? Date.parse(deadline) : NaN
  const [shown, setShown] = useState<{ end: number; left: number } | null>(null)
  useEffect(() => {
    if (!Number.isFinite(end)) return
    const timer = window.setInterval(() => {
      const left = secondsUntil(end)
      setShown((s) => (s?.end === end && s.left === left ? s : { end, left }))
      if (left === 0) window.clearInterval(timer)
    }, 200)
    return () => window.clearInterval(timer)
  }, [end])
  if (!Number.isFinite(end)) return null
  // Until the first tick for this deadline, the value is worked out now.
  return shown?.end === end ? shown.left : secondsUntil(end)
}
