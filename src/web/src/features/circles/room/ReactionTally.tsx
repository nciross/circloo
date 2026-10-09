import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { spring, useReducedMotion } from '../../../lib/motion'
import { REACTION_EMOJI, REACTION_KINDS, SAY_EVERY, SAY_GATHER, diffCounts, summarize, type ReactionCounts, type Waves } from './reactions'
import '../../../styles/reactions.css'

/**
 * The grouped reactions beside a surface (spec 008 US4): one "👏 ×40" chip per kind while its wave lasts, in the fixed
 * kind order so chips never trade places. With motion on, the chips are where the reactions that did not get to float
 * still show; under reduced motion they are the only sign, static. Screen readers hear one polite summary at most every
 * few seconds ("12 applause, 3 hearts"), never one announcement per burst; `announce={false}` keeps a display such as
 * the projector quiet.
 */
export function ReactionTally({ waves, totals, className, announce = true }: { waves: Waves; totals: ReactionCounts; className?: string; announce?: boolean }) {
  const { t, i18n } = useTranslation()
  const reduced = useReducedMotion()
  const [said, setSaid] = useState('')
  const latest = useRef(totals)
  const told = useRef(totals)
  const lastSaid = useRef(0)
  const sayTimer = useRef<number | undefined>(undefined)
  const clearTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    latest.current = totals
    if (!announce || sayTimer.current !== undefined || Object.keys(diffCounts(totals, told.current)).length === 0) return
    const wait = Math.max(SAY_GATHER, lastSaid.current + SAY_EVERY - Date.now())
    sayTimer.current = window.setTimeout(() => {
      sayTimer.current = undefined
      const fresh = diffCounts(latest.current, told.current)
      told.current = latest.current
      const text = summarize(fresh, (kind, count) => t(`circles.reactions.say.${kind}`, { count }), i18n.language)
      if (!text) return
      lastSaid.current = Date.now()
      setSaid(text)
      // Emptied again, so the next summary is a change even when it says the same words.
      window.clearTimeout(clearTimer.current)
      clearTimer.current = window.setTimeout(() => setSaid(''), SAY_EVERY - 500)
    }, wait)
  }, [totals, announce, t, i18n.language])

  // Forgets its timers when it goes (and when development mode mounts it twice), so a later mount can speak again.
  useEffect(
    () => () => {
      window.clearTimeout(sayTimer.current)
      window.clearTimeout(clearTimer.current)
      sayTimer.current = undefined
    },
    [],
  )

  const kinds = REACTION_KINDS.filter((k) => waves[k])
  return (
    <div className={['reaction-tally', reduced ? 'is-still' : '', className].filter(Boolean).join(' ')}>
      <AnimatePresence initial={false}>
        {kinds.map((kind) => {
          const count = waves[kind]!.count
          return (
            <motion.span key={kind} className="reaction-tally__chip" data-kind={kind} data-count={count} aria-hidden="true"
              initial={reduced ? false : { scale: 0.6 }} animate={{ scale: 1, transition: reduced ? { duration: 0 } : spring.snappy }}
              exit={reduced ? undefined : { scale: 0, transition: { duration: 0.16 } }}>
              <span className="reaction-tally__emoji">{REACTION_EMOJI[kind]}</span>
              {/* Keyed by the count: each rise replays the pop. "×40" reads the same way in Arabic. */}
              <bdi key={count} dir="ltr" className="reaction-tally__n">×{count}</bdi>
            </motion.span>
          )
        })}
      </AnimatePresence>
      {announce ? <p className="visually-hidden" role="status">{said}</p> : null}
    </div>
  )
}
