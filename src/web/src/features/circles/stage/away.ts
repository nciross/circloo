/**
 * The animator-away countdown (spec 009 edge cases, contracts/hub.md "Animator away"): while no animator is connected
 * during a call, `Discussion.awayEndsAt` says when the call ends. The time left is shown as minutes and seconds and never
 * announced every second; the sentence that says the animator is away is announced once.
 */
import { useEffect, useState } from 'react'
import { useStage } from './stage'

/** Seconds left until `endsAt`, never below zero; null when there is no countdown. */
export function secondsLeft(endsAt: string | null | undefined, now: number): number | null {
  if (!endsAt) return null
  const end = Date.parse(endsAt)
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.ceil((end - now) / 1000))
}

/** "4:05": minutes and two-digit seconds, the same in every language (Latin digits, like the rest of the room's times). */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** The seconds left while the animator is away during a call, ticking once a second; null otherwise. */
export function useAwayLeft(): number | null {
  const on = useStage((s) => s.discussion?.on ?? false)
  const away = useStage((s) => s.discussion?.away === 'away')
  const endsAt = useStage((s) => s.discussion?.awayEndsAt ?? null)
  const counting = on && away && !!endsAt
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!counting) return
    // The first tick comes at once, so a countdown that starts later than this component never shows a stale time.
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [counting, endsAt])

  return counting ? secondsLeft(endsAt, now) : null
}
