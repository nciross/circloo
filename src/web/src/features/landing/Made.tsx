import { useEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { motion as m } from 'motion/react'
import { ArrowRight, Globe } from 'lucide-react'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import type { Mood } from '../../components/MoodIcon'
import { Ring } from '../../components/Ring'
import { Bird } from '../pirikoo/Bird'
import { activityById } from '../circles/catalog'
import { clearPrompt, keepPrompt } from '../../lib/circlePrompt'
import { spring } from '../../lib/motion'
import { seatsFor } from './compose'
import type { Phase, Run } from './useCompose'

const CAST: CharacterId[] = ['panda', 'fox', 'octopus', 'robot', 'frog', 'owl', 'bunny', 'dino']
const NEXT = '/signin?returnTo=%2Fapp%2Fcircles%2Fnew'

/** How far the composition has run: the brass arc around the ring, a transit that completes when the circle is ready. */
const TRANSIT: Record<Phase, number> = { thinking: 0.06, naming: 0.22, seating: 0.48, chipping: 0.66, speaking: 0.88, done: 1, settled: 1 }

/** A body hopping onto the track (spring.snappy, 40 ms between bodies that arrive together); a chip dropping in. */
const HOP = { opacity: 0, scale: 0.4 }
const SEATED = { opacity: 1, scale: 1 }
const DROP = { opacity: 0, y: -8 }
const LANDED = { opacity: 1, y: 0 }
const STAGGER = 0.04

/**
 * The circle as it composes (#247, orrery #250): name, a ring whose seats fill with bodies, activity chips, the
 * language and Pirikoo's opening line, then the one button that makes it real. Decorative parts are hidden; one
 * polite status line announces the result (a plain div, not <output>: that would be a second status region).
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
  // The circle's sky follows the composition: cloudy while it thinks, bright as people arrive, sunny once ready.
  const mood: Mood = !run ? 3 : done ? 5 : run.seats > 0 ? 4 : 3

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
      <div className="made__head">
        <p className="made__name" aria-hidden={run ? undefined : 'true'}>
          {run ? <bdi>{run.name.slice(0, run.nameChars)}</bdi> : t('landing.made.empty')}
          {run && run.phase === 'naming' ? <span className="made__caret" aria-hidden="true" /> : null}
        </p>
        <span className="lozenge lozenge--neutral">{t('landing.made.preview')}</span>
      </div>

      <div className="made__ring" style={{ '--n': seats.shown } as CSSProperties}>
        <Ring
          key={run?.n ?? 0}
          size="lg"
          bodies={[]}
          mood={run ? mood : null}
          progress={run ? TRANSIT[run.phase] : undefined}
          compose={live && Boolean(run)}
          label={run ? t('circles.ring.label', { name: run.name, count: run.result.people }) : t('landing.made.empty')}
        >
          <div className="made__centre">
            <FaceMark mood={mood} interactive={live ? 'force' : false} className="made__face" />
            {run && run.seats > 0 ? (
              <p className="made__count">
                {t('landing.made.people', { count: run.result.people })}
                {seats.more > 0 && shown === seats.shown ? <span className="made__more"> {t('landing.made.more', { count: seats.more })}</span> : null}
              </p>
            ) : null}
          </div>
        </Ring>
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
