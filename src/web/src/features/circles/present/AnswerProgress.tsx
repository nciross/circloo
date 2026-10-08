import { useTranslation } from 'react-i18next'
import type { Member } from '../../../api/circles'
import { Character } from '../../../components/Character'
import { Meter } from '../../../components/Meter'
import { useLive, type PresentationState } from './presentation'

/** At most this many waiting characters are drawn; the rest are counted. */
const SHOWN = 12

/**
 * "3 of 5 answered" over a meter of the answers in and, for the animator while answering is open, the characters still
 * to answer (spec 006 US4). Who chose what stays secret until the reveal. Only the animator and the audience screen
 * receive these figures; the projector shows the count alone, so nobody is singled out in front of the room.
 */
export function AnswerProgress({ state, members, showPending = true, className }: { state: PresentationState; members: Member[]; showPending?: boolean; className?: string }) {
  const { t } = useTranslation()
  const count = useLive((s) => s.count)
  if (state.slide.kind === 'deck' || state.phase === 'idle' || count?.slideId !== state.slide.slideId) return null
  const waiting = showPending && state.phase === 'answering'
    ? count.pending.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => Boolean(m))
    : []
  return (
    <section className={['answer-progress', className].filter(Boolean).join(' ')} aria-label={t('present.answersTitle')}>
      <p className="answer-progress__count">{t('present.answered', { count: count.answered, of: count.of })}</p>
      <Meter value={count.answered} max={count.of} tone="ink" className="answer-progress__meter" />
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
