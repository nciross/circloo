import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Globe } from 'lucide-react'
import { FaceMark } from '../../components/Brand'
import { Character } from '../../components/Character'
import type { CharacterId } from '../../components/characters'
import { Bird } from '../pirikoo/Bird'
import { activityById } from '../circles/catalog'
import { clearPrompt, keepPrompt } from '../../lib/circlePrompt'
import { seatsFor } from './compose'
import type { Run } from './useCompose'

const CAST: CharacterId[] = ['panda', 'fox', 'octopus', 'robot', 'frog', 'owl', 'bunny', 'dino']
const NEXT = '/signin?returnTo=%2Fapp%2Fcircles%2Fnew'

/**
 * The circle as it composes (#247): name, ring of seats, activity chips, the language and Pirikoo's opening line,
 * then the one button that makes it real. Decorative parts are hidden; one polite status line announces the result
 * (a plain div, not <output>: that would be a second status region).
 */
export function Made({ run, motion }: { run: Run | null; motion: boolean }) {
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
  const mood = !run ? 3 : done ? 5 : run.seats > 0 ? 4 : 3

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
        {Array.from({ length: seats.shown }, (_, i) => (
          <div key={i} className={`made__seat${i < shown ? ' is-in' : ''}`} aria-hidden="true" style={{ '--i': i } as CSSProperties}>
            <span className="made__seat-body">
              {i < shown ? <Character id={CAST[i % CAST.length]!} className="made__char" tag={false} /> : <span className="made__empty-seat" />}
            </span>
          </div>
        ))}
        <div className="made__centre">
          <FaceMark mood={mood} interactive={motion ? 'force' : false} className="made__face" />
          {run && run.seats > 0 ? (
            <p className="made__count">
              {t('landing.made.people', { count: run.result.people })}
              {seats.more > 0 && shown === seats.shown ? <span className="made__more"> {t('landing.made.more', { count: seats.more })}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      <ul className="made__chips" aria-label={t('circles.create.activities')}>
        {run
          ? run.result.activities.slice(0, run.chips).map((id, i) => {
              const Icon = activityById(id)?.icon
              const cat = activityById(id)?.category ?? 'icebreakers'
              return (
                <li key={id} className={`made__chip made__chip--${cat}`} style={{ '--i': i } as CSSProperties}>
                  {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                  {t(`activities.${id}.title`)}
                </li>
              )
            })
          : null}
        {run && run.chips === run.result.activities.length && run.phase !== 'thinking' ? (
          <li className="made__chip made__chip--lang" style={{ '--i': run.chips } as CSSProperties}>
            <Globe size={16} aria-hidden="true" />
            {t(`common.languages.${run.result.locale}`)}
          </li>
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
