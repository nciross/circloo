import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '../../i18n'
import { compose, seatsFor, type Composition } from './compose'

/** `done` is the moment the circle is ready (the bird hops); `settled` follows it. */
export type Phase = 'thinking' | 'naming' | 'seating' | 'chipping' | 'speaking' | 'done' | 'settled'

/** One composition being played: what is already on screen, counted in characters, seats and chips. */
export interface Run {
  n: number
  text: string
  result: Composition
  name: string
  line: string
  phase: Phase
  nameChars: number
  seats: number
  chips: number
  lineChars: number
}

export interface Words { name: string; line: string }

const THINK_MS = 300
const NAME_MS = 40
const NAME_CAP_MS = 1200
const SEAT_MS = 90
const CHIP_MS = 70
const LINE_MS = 18
const LINE_CAP_MS = 1400
const CHEER_MS = 700

/** The run as it looks once finished: what a still page shows at once. */
function finished(r: Run): Run {
  return { ...r, phase: 'settled', nameChars: r.name.length, seats: seatsFor(r.result.people).shown, chips: r.result.activities.length, lineChars: r.line.length }
}

/**
 * The focal moment of the landing (#247): a line becomes a circle in front of the visitor. The bird thinks, the name
 * types itself, the seats fill, the activity chips drop in, Pirikoo says how it opens. A new line cancels the run.
 * Without motion the whole circle appears at once.
 */
export function useCompose(locale: Locale, motion: boolean, words: (c: Composition) => Words) {
  const [run, setRun] = useState<Run | null>(null)
  const timers = useRef<number[]>([])
  const count = useRef(0)
  const latest = useRef({ motion, words })
  useEffect(() => {
    latest.current = { motion, words }
  })

  const stop = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => stop, [])

  const start = useCallback(
    (text: string) => {
      stop()
      const n = ++count.current
      const result = compose(text, locale)
      const { name, line } = latest.current.words(result)
      const { shown } = seatsFor(result.people)
      const fresh: Run = { n, text, result, name, line, phase: 'thinking', nameChars: 0, seats: 0, chips: 0, lineChars: 0 }
      if (!latest.current.motion) {
        setRun(finished(fresh))
        return
      }
      setRun(fresh)
      const steps: { at: number; patch: Partial<Run> }[] = []
      let at = THINK_MS
      steps.push({ at, patch: { phase: 'naming' } })
      const nameStep = Math.min(NAME_MS, NAME_CAP_MS / Math.max(1, name.length))
      for (let i = 1; i <= name.length; i++) steps.push({ at: (at += nameStep), patch: { nameChars: i } })
      steps.push({ at: (at += 120), patch: { phase: 'seating' } })
      for (let i = 1; i <= shown; i++) steps.push({ at: (at += SEAT_MS), patch: { seats: i } })
      steps.push({ at: (at += 120), patch: { phase: 'chipping' } })
      for (let i = 1; i <= result.activities.length; i++) steps.push({ at: (at += CHIP_MS), patch: { chips: i } })
      steps.push({ at: (at += 150), patch: { phase: 'speaking' } })
      const lineStep = Math.min(LINE_MS, LINE_CAP_MS / Math.max(1, line.length))
      for (let i = 1; i <= line.length; i++) steps.push({ at: (at += lineStep), patch: { lineChars: i } })
      steps.push({ at: (at += 100), patch: { phase: 'done' } })
      steps.push({ at: (at += CHEER_MS), patch: { phase: 'settled' } })
      for (const s of steps) {
        timers.current.push(window.setTimeout(() => setRun((r) => (r && r.n === n ? { ...r, ...s.patch } : r)), s.at))
      }
    },
    [locale],
  )

  // Motion switched off mid-run: the timers stop and the finished circle shows at once. The stored run is finished
  // too (adjusted while rendering, not in an effect), so it stays whole when motion comes back: no timer would ever
  // advance a half-typed run.
  const [lastMotion, setLastMotion] = useState(motion)
  if (lastMotion !== motion) {
    setLastMotion(motion)
    if (!motion && run && run.phase !== 'settled') setRun(finished(run))
  }
  useEffect(() => {
    if (!motion) stop()
  }, [motion])

  return { run, start }
}
