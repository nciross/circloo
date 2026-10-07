import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import type { Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { dur, spring, useReducedMotion } from '../../../lib/motion'
import { useLive, type PresentationState } from './presentation'

/** At most this many waiting characters are drawn; the rest are counted. */
const SHOWN = 12
/** At most this many bodies land on the rule; the count says the rest. */
const BODIES = 24

/**
 * "3 of 5 answered" and, for the animator while answering is open, the characters still to answer (spec 006 US4).
 * Every answer lands as a body on the brass rule (snappy spring; a fade under reduced motion). Who chose what stays
 * secret until the reveal, so the bodies are anonymous. Only the animator and the audience screen receive these
 * figures; the projector shows the count alone, so nobody is singled out in front of the room.
 */
export function AnswerProgress({ state, members, showPending = true, className }: { state: PresentationState; members: Member[]; showPending?: boolean; className?: string }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const count = useLive((s) => s.count)
  if (state.slide.kind === 'deck' || state.phase === 'idle' || count?.slideId !== state.slide.slideId) return null
  const done = count.of > 0 ? Math.round((count.answered / count.of) * 100) : 0
  const waiting = showPending && state.phase === 'answering'
    ? count.pending.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => Boolean(m))
    : []
  const landed = Math.min(BODIES, count.answered)
  return (
    <section className={['answer-progress', className].filter(Boolean).join(' ')} aria-label={t('present.answersTitle')}>
      <p className="answer-progress__count">{t('present.answered', { count: count.answered, of: count.of })}</p>
      <ul className="answer-progress__bodies" aria-hidden="true">
        {Array.from({ length: landed }, (_, i) => (
          <motion.li
            key={i}
            className="answer-progress__body"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduced ? { duration: dur.state } : spring.snappy}
          />
        ))}
      </ul>
      <span className="answer-progress__bar" style={{ '--done': `${done}%` } as CSSProperties} aria-hidden="true" />
      {waiting.length > 0 ? (
        <>
          <p className="answer-progress__label">{t('present.stillToAnswer')}</p>
          <ul className="answer-progress__pending">
            {waiting.slice(0, SHOWN).map((m) => (
              <li key={m.id} title={m.name}>
                <Character id={m.character} ring={m.ring} tag={false} className="answer-progress__char" />
                {/* Shared characters show the name: at this size a ring number would be unreadable. */}
                {m.ring > 0 ? <bdi className="answer-progress__name">{m.name}</bdi> : <span className="visually-hidden">{m.name}</span>}
              </li>
            ))}
            {waiting.length > SHOWN ? (
              <li className="answer-progress__more">
                <span aria-hidden="true">{t('present.andMore', { count: waiting.length - SHOWN })}</span>
                <span className="visually-hidden">{t('present.andMoreLabel', { count: waiting.length - SHOWN })}</span>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </section>
  )
}
