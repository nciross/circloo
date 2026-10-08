import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { motion as m } from 'motion/react'
import { ArrowRight, Globe } from 'lucide-react'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import { Bird } from '../pirikoo/Bird'
import { activityById } from '../circles/catalog'
import { clearPrompt, keepPrompt } from '../../lib/circlePrompt'
import { spring } from '../../lib/motion'
import { seatsFor } from './compose'
import type { Run } from './useCompose'
import { Squiggle, Star } from './Doodles'

const CAST: CharacterId[] = ['panda', 'fox', 'octopus', 'robot', 'frog', 'owl', 'bunny', 'dino']
const NEXT = '/signin?returnTo=%2Fapp%2Fcircles%2Fnew'

/** Where the eight seats float around the panel's inner edges at desktop widths (percent of the panel, a tilt). */
const SEATS: { x: number; y: number; r: number }[] = [
  { x: 7, y: 18, r: -8 },
  { x: 92, y: 14, r: 7 },
  { x: 4, y: 62, r: 5 },
  { x: 95, y: 56, r: -6 },
  { x: 15, y: 88, r: -5 },
  { x: 84, y: 86, r: 8 },
  { x: 28, y: 8, r: 4 },
  { x: 68, y: 92, r: -7 },
]

/** A body hopping onto a seat (spring.snappy, 40 ms between bodies that arrive together); a chip dropping in. */
const HOP = { opacity: 0, scale: 0.4 }
const SEATED = { opacity: 1, scale: 1 }
const DROP = { opacity: 0, y: -8 }
const LANDED = { opacity: 1, y: 0 }
const STAGGER = 0.04

/**
 * The circle as it composes (#247, #250): one large rounded panel with pastel corners, the seats as round character
 * stickers floating around its edges, the name at the centre as it types, the chips, Pirikoo's line, then the one
 * button that makes it real. Decorative parts are hidden; one polite status line announces the result (a plain p,
 * not <output>: that would be a second status region).
 */
export function Made({ run, motion: live }: { run: Run | null; motion: boolean }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const done = run?.phase === 'done' || run?.phase === 'settled'
  // One polite line per composition, once it is complete; never the characters as they type.
  const announce = run && done
    ? t('landing.made.announce', {
        name: run.name,
        people: t('landing.made.people', { count: run.result.people }),
        activities: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(run.result.activities.map((id) => t(`activities.${id}.title`))),
      })
    : ''

  const seats = run ? seatsFor(run.result.people) : { shown: 6, more: 0 }
  const shown = run ? run.seats : 0

  // Bodies that mount in the same commit hop in 40 ms apart; one arriving alone hops at once.
  const seated = useRef(0)
  const batchStart = Math.min(seated.current, shown)
  useEffect(() => {
    seated.current = shown
  })

  const hop = (i: number) => (live ? { ...spring.snappy, delay: Math.max(0, i - batchStart) * STAGGER } : { duration: 0 })
  const drop = live ? spring.snappy : { duration: 0 }

  return (
    <div className={`made${run ? ' is-on' : ''}${done ? ' is-done' : ''}`} data-phase={run?.phase ?? 'empty'}>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>

      <Star className="made__doodle made__doodle--star" />
      <Squiggle className="made__doodle made__doodle--squiggle" />

      <ul className="made__seats" aria-hidden="true">
        {Array.from({ length: seats.shown }, (_, i) => {
          const at = SEATS[i % SEATS.length]!
          return (
            <li key={i} className={`made__seat${i < shown ? ' is-in' : ''}`} style={{ '--i': i, '--x': `${at.x}%`, '--y': `${at.y}%`, '--r': `${at.r}deg` } as CSSProperties}>
              {i < shown ? (
                <m.span className="made__seat-body" initial={live ? HOP : false} animate={SEATED} transition={hop(i)}>
                  <Character id={CAST[i % CAST.length]!} className="made__char" tag={false} />
                </m.span>
              ) : (
                <span className="made__empty-seat" />
              )}
            </li>
          )
        })}
      </ul>

      <div className="made__centre">
        <span className="lozenge made__eyebrow">{t('landing.made.preview')}</span>
        <p className="made__name" aria-hidden={run ? undefined : 'true'}>
          {run ? <bdi>{run.name.slice(0, run.nameChars)}</bdi> : t('landing.made.empty')}
          {run && run.phase === 'naming' ? <span className="made__caret" aria-hidden="true" /> : null}
        </p>
        {run && run.seats > 0 ? (
          <p className="made__count">
            {t('landing.made.people', { count: run.result.people })}
            {seats.more > 0 && shown === seats.shown ? <span className="made__more"> {t('landing.made.more', { count: seats.more })}</span> : null}
          </p>
        ) : null}

        <ul className="made__chips" aria-label={t('circles.create.activities')}>
          {run
            ? run.result.activities.slice(0, run.chips).map((id, i) => {
                const Icon = activityById(id)?.icon
                const cat = activityById(id)?.category ?? 'icebreakers'
                return (
                  <m.li key={id} className={`made__chip made__chip--${cat}`} style={{ '--i': i } as CSSProperties} initial={live ? DROP : false} animate={LANDED} transition={drop}>
                    {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                    {t(`activities.${id}.title`)}
                  </m.li>
                )
              })
            : null}
          {run && run.chips === run.result.activities.length && run.phase !== 'thinking' ? (
            <m.li className="made__chip made__chip--lang" style={{ '--i': run.chips } as CSSProperties} initial={live ? DROP : false} animate={LANDED} transition={drop}>
              <Globe size={16} aria-hidden="true" />
              {t(`common.languages.${run.result.locale}`)}
            </m.li>
          ) : null}
        </ul>

        <div className={`made__say${run && run.lineChars > 0 ? ' is-on' : ''}`} aria-hidden={run && run.lineChars > 0 ? undefined : 'true'}>
          <span className="made__say-bird"><Bird mood={run?.phase === 'speaking' ? 'speaking' : run?.phase === 'done' ? 'happy' : undefined} /></span>
          <p className="made__say-text">
            {run ? run.line.slice(0, run.lineChars) : ''}
            {run?.phase === 'speaking' ? <span className="made__caret made__caret--line" aria-hidden="true" /> : null}
            {done ? <span className="made__say-smile" aria-hidden="true"> :)</span> : null}
          </p>
        </div>

        <div className="made__actions" aria-hidden={done ? undefined : 'true'}>
          <button
            type="button"
            className="btn btn--primary btn--lg"
            tabIndex={done ? 0 : -1}
            onClick={() => {
              if (run) keepPrompt(run.text)
              void navigate(NEXT, { viewTransition: true })
            }}
          >
            <span className="btn__label">{t('landing.made.create')}</span>
            <span className="btn__icon" aria-hidden="true"><ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} /></span>
          </button>
          <Link className="made__byhand" to={NEXT} tabIndex={done ? 0 : -1} onClick={clearPrompt} viewTransition>{t('landing.made.byHand')}</Link>
        </div>
      </div>
    </div>
  )
}
