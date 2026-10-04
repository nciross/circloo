import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Send } from 'lucide-react'
import { Button } from '../../../components/Button'
import { useRoom } from '../room'
import { Countdown } from './Countdown'
import { useSecondsLeft } from './useSecondsLeft'
import { isRevealed, useLive, type PresentationState, type QuestionSlide } from './presentation'
import { QuestionHead, Share } from './SlideStage'
import { Reveal } from './Reveal'

const EMPTY: string[] = []

/**
 * A participant answers the current question from their own screen (spec 006 US4). One tap answers a single-choice
 * question; a multiple-choice poll is picked, then sent. A poll answer can change while answering is open, a quiz
 * answer cannot, and nothing is sendable once the server's deadline has passed. Mount it with the slide id as key, so
 * a new question starts clean, its own errors included.
 */
export function AnswerPad({ state, slide }: { state: PresentationState; slide: QuestionSlide }) {
  const { t } = useTranslation()
  const confirmed = useLive((s) => s.mine[slide.slideId]) ?? EMPTY
  const [draft, setDraft] = useState<string[] | null>(null)
  const [sending, setSending] = useState<string[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const left = useSecondsLeft(state.phase === 'answering' ? state.deadline : null)

  const quiz = slide.kind === 'quiz'
  const multiple = slide.multipleChoice && !quiz
  const answered = confirmed.length > 0
  const open = state.phase === 'answering' && left !== 0
  const canPick = open && !(quiz && answered) && !sending
  // Once answers close, only what the server counted stays marked: a pick never sent is not an answer.
  const marked = open ? (sending ?? draft ?? confirmed) : confirmed
  const unsent = open && draft !== null && (draft.length !== confirmed.length || draft.some((id) => !confirmed.includes(id)))

  const send = async (options: string[]) => {
    setSending(options)
    setFailed(null)
    try {
      await useRoom.getState().answer(slide.slideId, options)
      setDraft(null)
    } catch {
      // The code the server gave; the last confirmed answer stays marked.
      setFailed(useRoom.getState().error ?? 'failed')
    } finally {
      setSending(null)
    }
  }

  const pick = (id: string) => {
    if (!canPick) return
    setFailed(null)
    if (multiple) {
      const current = draft ?? confirmed
      setDraft(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
    } else if (!(confirmed.length === 1 && confirmed[0] === id)) {
      void send([id])
    }
  }

  const status =
    state.phase === 'idle' ? t('present.answer.wait')
    : !open ? t(answered ? 'present.answer.closedCounted' : 'present.answer.closed')
    : unsent ? t('present.answer.unsent')
    : answered ? t(quiz ? 'present.answer.inFinal' : 'present.answer.inChange')
    : t(quiz ? 'present.answer.tapFinal' : multiple ? 'present.answer.pickMany' : 'present.answer.tap')

  return (
    <section className={['stage-slide', 'is-question', 'answer-pad', open ? 'is-open' : ''].filter(Boolean).join(' ')} aria-labelledby={`pad-${slide.slideId}`}>
      <div className="stage-slide__question">
        <div id={`pad-${slide.slideId}`}><QuestionHead slide={slide} /></div>
        {quiz && state.phase === 'answering' && state.deadline ? (
          // The status line says when answers close, so the countdown does not announce it too.
          <Countdown deadline={state.deadline} total={slide.timerSeconds ?? 20} announceEnd={false} className="answer-pad__countdown" />
        ) : null}
        {/* Where the eye already is: an error replaces the status line. */}
        {failed ? (
          <p className="answer-pad__status field__error" role="alert">{t(`circles.errors.${failed}`, { defaultValue: t('circles.errors.failed') })}</p>
        ) : (
          <p className="answer-pad__status" role="status">{status}</p>
        )}
        {isRevealed(state) && state.results ? (
          <Reveal slide={slide} results={state.results} mine={confirmed} />
        ) : (
          <ul className={['answer-pad__options', state.results ? 'has-results' : ''].filter(Boolean).join(' ')}>
            {slide.options.map((o, i) => {
              const on = marked.includes(o.id)
              const busy = sending?.includes(o.id) ?? false
              return (
                <li key={o.id}>
                  <button type="button" className={['answer-pad__option', on ? 'is-on' : '', busy ? 'is-sending' : ''].filter(Boolean).join(' ')}
                    aria-pressed={on} aria-disabled={!canPick || undefined} aria-busy={busy || undefined} onClick={() => pick(o.id)}>
                    <span className="stage-slide__letter" aria-hidden="true">{on ? <Check size={16} /> : i + 1}</span>
                    <span className="stage-slide__text" dir="auto">{o.text}</span>
                    <Share results={state.results} id={o.id} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {multiple && open ? (
          <Button className="answer-pad__send" icon={<Send size={16} className="flip-rtl" />} busy={sending !== null}
            aria-disabled={!unsent || (draft?.length ?? 0) === 0 || undefined}
            onClick={() => (unsent && draft && draft.length > 0 ? void send(draft) : undefined)}>
            {t(answered ? 'present.answer.update' : 'present.answer.send')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
