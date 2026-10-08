import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { motion as m } from 'motion/react'
import { ArrowRight, Globe } from 'lucide-react'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import type { Mood } from '../../components/MoodIcon'
import { Bird } from '../pirikoo/Bird'
import { activityById } from '../circles/catalog'
import { clearPrompt, keepPrompt } from '../../lib/circlePrompt'
import { spring } from '../../lib/motion'
import { seatsFor } from './compose'
import type { Phase, Run } from './useCompose'

const CAST: CharacterId[] = ['panda', 'fox', 'octopus', 'robot', 'frog', 'owl', 'bunny', 'dino']
const NEXT = '/signin?returnTo=%2Fapp%2Fcircles%2Fnew'

/** How far the composition has run: the table's rim fills from white to the sun as the phases complete. */
const TRANSIT: Record<Phase, number> = { thinking: 0.06, naming: 0.22, seating: 0.48, chipping: 0.66, speaking: 0.88, done: 1, settled: 1 }

/** A body hopping onto a seat (spring.snappy, 40 ms between bodies that arrive together); a chip dropping in. */
const HOP = { opacity: 0, scale: 0.4 }
const SEATED = { opacity: 1, scale: 1 }
const DROP = { opacity: 0, y: -8 }
const LANDED = { opacity: 1, y: 0 }
const STAGGER = 0.04

/** A hand-drawn arrow for the asides on the field: a curve with a small open head, drawn in the current colour. */
export function Arrow() {
  return (
    <svg className="note__arrow" viewBox="0 0 80 60" aria-hidden="true" focusable="false">
      <path d="M4 6 C 28 4, 54 14, 68 44" />
      <path d="M56 40 L 69 46 L 70 32" />
    </svg>
  )
}

/**
 * The circle as it composes (#247, buddy list #250): a round table seen from above with the circloo face at its centre,
 * bodies hopping onto the seats around its edge, the name on a sticky note, activity chips scattered beside it, and
 * Pirikoo's opening line on a notepad, then the one button that makes it real. Decorative parts are hidden; one polite
 * status line announces the result (a plain div, not <output>: that would be a second status region).
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
  // The table's face follows the composition: cloudy while it thinks, bright as people arrive, sunny once ready.
  const mood: Mood = !run ? 4 : done ? 5 : run.seats > 0 ? 4 : 3

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

      <div className="made__stage" style={{ '--n': seats.shown, '--transit': run ? TRANSIT[run.phase] : 0 } as CSSProperties}>
        <div className="made__table">
          <svg className="made__top" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <circle className="made__cast" cx="55" cy="56" r="46" />
            <circle className="made__wood" cx="50" cy="50" r="46" />
            <circle className="made__rim" cx="50" cy="50" r="41.5" pathLength="1" />
            <circle className="made__arc" cx="50" cy="50" r="41.5" pathLength="1" />
          </svg>
          <div className="made__centre">
            <FaceMark mood={mood} interactive={live ? 'force' : false} className="made__face" />
            {run && run.seats > 0 ? (
              <p className="made__count">
                {t('landing.made.people', { count: run.result.people })}
                {seats.more > 0 && shown === seats.shown ? <span className="made__more"> {t('landing.made.more', { count: seats.more })}</span> : null}
              </p>
            ) : null}
          </div>
        </div>
        <ul className="made__seats" aria-hidden="true">
          {Array.from({ length: seats.shown }, (_, i) => (
            <li key={i} className={`made__seat${i < shown ? ' is-in' : ''}`} style={{ '--i': i } as CSSProperties}>
              {i < shown ? (
                <m.span className="made__seat-body" initial={live ? HOP : false} animate={SEATED} transition={hop(i)}>
                  <Character id={CAST[i % CAST.length]!} className="made__char" tag={false} />
                </m.span>
              ) : (
                <span className="made__empty-seat" />
              )}
            </li>
          ))}
        </ul>

        <p className="made__name" aria-hidden={run ? undefined : 'true'}>
          {run ? <bdi>{run.name.slice(0, run.nameChars)}</bdi> : t('landing.made.empty')}
          {run && run.phase === 'naming' ? <span className="made__caret" aria-hidden="true" /> : null}
        </p>

        <span className="note note--seats" aria-hidden="true">
          <span className="note__text">{t('landing.notes.seats')}</span>
          <Arrow />
        </span>
        <span className="note note--name" aria-hidden="true">
          <span className="note__text">{t('landing.notes.name')}</span>
          <Arrow />
        </span>
      </div>

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
  )
}
