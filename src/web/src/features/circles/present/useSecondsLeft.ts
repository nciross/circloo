import { useEffect, useState } from 'react'
import { serverNow } from './presentation'

/**
 * Whole seconds left until a quiz deadline, on the server's clock (contracts/hub.md `serverNow`): a phone whose clock
 * is a minute off still counts down with everyone else. Re-renders a few times a second so it never skips a number.
 */
export function useSecondsLeft(deadline: string | null | undefined): number | null {
  const end = deadline ? Date.parse(deadline) : NaN
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(end)) return
    const timer = window.setInterval(() => setTick((n) => n + 1), 200)
    return () => window.clearInterval(timer)
  }, [end])
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - serverNow()) / 1000)) : null
}
