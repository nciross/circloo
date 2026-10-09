import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, ChevronLeft, ChevronRight, EyeOff, Eye, Lock, MonitorUp, Play, Square, StickyNote, Users } from 'lucide-react'
import { Button } from '../../../components/Button'
import { useRoom } from '../room'
import { keyAction } from './keys'
import { prefetch, useLive, type PresentationState } from './presentation'
import { SlideStage } from './SlideStage'
import { Countdown } from './Countdown'
import { AnswerProgress } from './AnswerProgress'
import { ReactionBar } from '../room/ReactionBar'
import { ReactionLayer } from '../room/ReactionLayer'
import { ReactionTally } from '../room/ReactionTally'
import { RoomSettings } from '../room/RoomSettings'
import { useReactions } from '../room/reactions'

/** Opens and closes answering on a question slide, then reveals its results (spec 006 US4, US5); a quiz shows its countdown while open. */
function QuestionControls({ state }: { state: PresentationState }) {
  const { t } = useTranslation()
  // Which action is on its way: only that button spins, and none can start meanwhile.
  const [busy, setBusy] = useState<string | null>(null)
  if (state.slide.kind === 'deck') return null
  const act = async (name: string, call: () => Promise<void>) => {
    if (busy) return
    setBusy(name)
    useRoom.getState().clearError()
    try {
      await call()
    } catch {
      // The view shows the error code.
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="presenter__question">
      {state.phase === 'idle' ? (
        <Button variant="primary" className="presenter__open" icon={<Play size={16} />} busy={busy === 'open'} onClick={() => act('open', useRoom.getState().openQuestion)}>
          {t('present.openAnswers')}
        </Button>
      ) : state.phase === 'answering' ? (
        <>
          {state.slide.kind === 'quiz' && state.deadline ? <Countdown deadline={state.deadline} total={state.slide.timerSeconds ?? 20} className="presenter__countdown" /> : null}
          <Button variant="default" className="presenter__lock" icon={<Lock size={16} />} busy={busy === 'lock'} onClick={() => act('lock', useRoom.getState().lockQuestion)}>
            {t('present.closeAnswers')}
          </Button>
          <Button variant="primary" className="presenter__reveal" icon={<BarChart3 size={16} />} busy={busy === 'reveal'} onClick={() => act('reveal', useRoom.getState().revealResults)}>
            {t('present.reveal.show')}
          </Button>
        </>
      ) : state.phase === 'locked' ? (
        <>
          <p className="presenter__closed" role="status"><Lock size={14} aria-hidden="true" /> {t('present.answersClosed')}</p>
          <Button variant="primary" className="presenter__reveal" icon={<BarChart3 size={16} />} busy={busy === 'reveal'} onClick={() => act('reveal', useRoom.getState().revealResults)}>
            {t('present.reveal.show')}
          </Button>
        </>
      ) : (
        <p className="presenter__closed"><BarChart3 size={14} aria-hidden="true" /> {t('present.reveal.shown')}</p>
      )}
    </div>
  )
}

/**
 * The animator's view while presenting (spec 006 US3): the current slide large, the next one and the notes beside it,
 * n/N and how many follow, and the controls. Notes and the next slide reach only the animator's own connections.
 * Keyboard shortcuts work while focus is inside this view (WCAG 2.1.4), which takes focus when it opens.
 * The room's reactions float over the slide and group beside it, under the controls; the animator may react too.
 * The chat's mode (open, slow, paused) and the reactions switch sit beside the notes (RoomSettings, spec 008 T806).
 */
export function PresenterView({ state, circleId }: { state: PresentationState; circleId: string }) {
  const { t, i18n } = useTranslation()
  const notes = useLive((s) => s.notes)
  const online = useRoom((s) => s.online)
  const members = useRoom((s) => s.members)
  const meId = useRoom((s) => s.me?.id)
  const error = useRoom((s) => s.error)
  const bursts = useReactions((s) => s.bursts)
  const waves = useReactions((s) => s.waves)
  const totals = useReactions((s) => s.totals)
  const [confirming, setConfirming] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const view = useRef<HTMLElement>(null)
  const cancelEnd = useRef<HTMLButtonElement>(null)
  const endButton = useRef<HTMLButtonElement>(null)
  const followers = online.filter((id) => id !== meId).length
  const first = state.position === 0
  const last = state.position >= state.count - 1
  const rtl = i18n.dir() === 'rtl'
  // Notes arrive just after the slide; until they match it the side panel shows nothing rather than "no notes".
  const notesReady = notes?.slideId === state.slide.slideId
  const upcoming = notesReady ? notes.upcoming : null

  // What the animator asked for last: quick presses build on it, so none is lost while the server answers.
  const asked = useRef<{ position: number | null; blank: boolean | null }>({ position: null, blank: null })
  const latest = () => useLive.getState().state ?? state
  const go = (delta: number) => {
    const from = asked.current.position ?? latest().position
    const target = from + delta
    if (target < 0 || target >= state.count) return
    asked.current.position = target
    useRoom.getState().goToSlide(target).catch(() => undefined).finally(() => {
      if (asked.current.position === target) asked.current.position = null
    })
  }
  const blank = () => {
    const next = !(asked.current.blank ?? latest().blank)
    asked.current.blank = next
    useRoom.getState().setBlank(next).catch(() => undefined).finally(() => {
      if (asked.current.blank === next) asked.current.blank = null
    })
  }

  useEffect(() => {
    view.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    prefetch(upcoming?.image)
  }, [upcoming?.image])

  useEffect(() => {
    if (confirming) cancelEnd.current?.focus()
  }, [confirming])

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && confirming) {
      e.preventDefault()
      setConfirming(false)
      endButton.current?.focus()
      return
    }
    const action = keyAction(e.nativeEvent, rtl)
    if (!action) return
    e.preventDefault()
    if (action === 'blank') blank()
    else go(action === 'next' ? 1 : -1)
  }

  const openAudience = () => {
    const opened = window.open(`/app/circles/${circleId}/audience`, `circloo-audience-${circleId}`, 'popup,width=1280,height=720')
    setPopupBlocked(!opened)
  }

  return (
    <section ref={view} className="presenter" tabIndex={-1} onKeyDown={onKeyDown} aria-labelledby="presenter-title">
      <h2 id="presenter-title" className="visually-hidden">{t('present.presenterTitle', { name: state.presentationName })}</h2>
      <div className="presenter__main">
        <SlideStage state={state} className="presenter__stage">
          <ReactionLayer bursts={bursts} />
        </SlideStage>
        <QuestionControls state={state} />
        <div className="presenter__bar">
          <Button variant="default" className="presenter__prev" icon={<ChevronLeft size={18} className="flip-rtl" />} aria-label={t('present.prev')}
            aria-disabled={first || undefined} onClick={() => go(-1)} />
          <p className="presenter__count" aria-live="polite">{t('present.counter', { n: state.position + 1, total: state.count })}</p>
          <Button variant="primary" className="presenter__next" icon={<ChevronRight size={18} className="flip-rtl" />} aria-label={t('present.next')}
            aria-disabled={last || undefined} onClick={() => go(1)} />
          <span className="presenter__spacer" />
          <Button variant="default" className="presenter__blank" icon={state.blank ? <Eye size={16} /> : <EyeOff size={16} />} aria-keyshortcuts="B" onClick={blank}>
            {state.blank ? t('present.unblank') : t('present.blank')}
          </Button>
          <Button variant="default" className="presenter__audience" icon={<MonitorUp size={16} />} onClick={openAudience}>{t('present.audience')}</Button>
          {confirming ? (
            <>
              <Button ref={cancelEnd} variant="subtle" onClick={() => { setConfirming(false); endButton.current?.focus() }}>{t('common.cancel')}</Button>
              <Button variant="danger" className="presenter__end-confirm" onClick={() => useRoom.getState().endPresentation().catch(() => undefined)}>{t('present.endConfirm')}</Button>
            </>
          ) : (
            <Button ref={endButton} variant="subtle" className="presenter__end" icon={<Square size={14} />} onClick={() => setConfirming(true)}>{t('present.end')}</Button>
          )}
        </div>
        <div className="presenter__reactions">
          <ReactionTally waves={waves} totals={totals} className="presenter__tally" />
          <ReactionBar className="presenter__react" />
        </div>
        {popupBlocked ? <p className="field__error" role="alert">{t('present.popupBlocked')}</p> : null}
        {error ? <p className="field__error" role="alert">{t(`circles.errors.${error}`, { defaultValue: t('circles.errors.failed') })}</p> : null}
        <p className="field__help presenter__keys">{t('present.keys')}</p>
      </div>
      <aside className="presenter__side" aria-busy={!notesReady || undefined}>
        <p className="presenter__followers" data-count={followers}><Users size={16} aria-hidden="true" /> {t('present.following', { count: followers })}</p>
        <AnswerProgress state={state} members={members} />
        <RoomSettings className="presenter__settings" />
        <section className="presenter__next-slide" aria-labelledby="present-next">
          <h3 id="present-next" className="presenter__label">{t('present.upNext')}</h3>
          {!notesReady ? null : upcoming ? (
            upcoming.image ? (
              <img src={upcoming.image} alt={t('present.slideAlt', { n: state.position + 2, total: state.count })} width={480} height={270} />
            ) : (
              <p className="presenter__next-question" dir="auto">{upcoming.question}</p>
            )
          ) : (
            <p className="field__help">{t('present.lastSlide')}</p>
          )}
        </section>
        <section className="presenter__notes" aria-labelledby="present-notes">
          <h3 id="present-notes" className="presenter__label"><StickyNote size={14} aria-hidden="true" /> {t('present.notes')}</h3>
          {!notesReady ? null : notes.notes ? (
            <p className="presenter__notes-text" dir="auto" tabIndex={0}>{notes.notes}</p>
          ) : (
            <p className="field__help">{t('present.noNotes')}</p>
          )}
        </section>
      </aside>
    </section>
  )
}
