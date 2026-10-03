import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, EyeOff, Eye, MonitorUp, Square, StickyNote, Users } from 'lucide-react'
import { Button } from '../../../components/Button'
import { useRoom } from '../room'
import { prefetch, useLive, type PresentationState } from './presentation'
import { SlideStage } from './SlideStage'

/** The freshest state, read at the moment of a key press rather than at the last render. */
const latestState = () => useLive.getState().state!

/** Keys that move: "next" follows the reading direction, so in Arabic the left arrow goes forward (spec 006 US3 #8). */
function keyAction(e: KeyboardEvent, rtl: boolean): 'next' | 'prev' | 'blank' | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return null
  // Space keeps pressing the focused button or link.
  if (e.key === ' ' && target?.closest('button, a, [role="button"], [role="radio"], [role="switch"]')) return null
  switch (e.key) {
    case 'PageDown':
    case ' ':
      return 'next'
    case 'PageUp':
      return 'prev'
    case 'ArrowRight':
      return rtl ? 'prev' : 'next'
    case 'ArrowLeft':
      return rtl ? 'next' : 'prev'
    case 'b':
    case 'B':
      return 'blank'
    default:
      return null
  }
}

/**
 * The animator's view while presenting (spec 006 US3): the current slide large, the next one and the notes beside it,
 * n/N and how many follow, and the controls. Notes and the next slide reach only the animator's own connections.
 */
export function PresenterView({ state, circleId }: { state: PresentationState; circleId: string }) {
  const { t, i18n } = useTranslation()
  const notes = useLive((s) => s.notes)
  const room = useRoom()
  const [confirming, setConfirming] = useState(false)
  const followers = room.online.filter((id) => id !== room.me?.id).length
  const first = state.position === 0
  const last = state.position >= state.count - 1
  const rtl = i18n.dir() === 'rtl'
  const upcoming = notes?.slideId === state.slide.slideId ? notes.upcoming : null

  // Where the animator asked to go last: quick presses build on it, so none is lost while the server answers.
  const asked = useRef<number | null>(null)
  const go = (delta: number) => {
    const from = asked.current ?? latestState().position
    const target = from + delta
    if (target < 0 || target >= state.count) return
    asked.current = target
    useRoom.getState().goToSlide(target).catch(() => undefined).finally(() => {
      if (asked.current === target) asked.current = null
    })
  }
  const blank = () => useRoom.getState().setBlank(!latestState().blank).catch(() => undefined)

  useEffect(() => {
    prefetch(upcoming?.image)
  }, [upcoming?.image])

  // The latest handlers, for the one keyboard listener below.
  const actions = useRef({ go, blank })
  useEffect(() => {
    actions.current = { go, blank }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e, rtl)
      if (!action) return
      e.preventDefault()
      if (action === 'blank') actions.current.blank()
      else actions.current.go(action === 'next' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rtl])

  const openAudience = () => {
    window.open(`/app/circles/${circleId}/audience`, `circloo-audience-${circleId}`, 'popup,width=1280,height=720')
  }

  return (
    <section className="presenter" aria-label={t('present.presenterTitle', { name: state.presentationName })}>
      <div className="presenter__main">
        <SlideStage state={state} className="presenter__stage" />
        <div className="presenter__bar">
          <Button variant="default" className="presenter__prev" icon={<ChevronLeft size={18} className="flip-rtl" />} aria-label={t('present.prev')}
            aria-disabled={first || undefined} onClick={() => go(-1)} />
          <p className="presenter__count" aria-live="polite">{t('present.counter', { n: state.position + 1, count: state.count })}</p>
          <Button variant="primary" className="presenter__next" icon={<ChevronRight size={18} className="flip-rtl" />} aria-label={t('present.next')}
            aria-disabled={last || undefined} onClick={() => go(1)} />
          <span className="presenter__spacer" />
          <Button variant="default" className="presenter__blank" aria-pressed={state.blank} icon={state.blank ? <Eye size={16} /> : <EyeOff size={16} />} aria-keyshortcuts="B" onClick={blank}>
            {state.blank ? t('present.unblank') : t('present.blank')}
          </Button>
          <Button variant="default" className="presenter__audience" icon={<MonitorUp size={16} />} onClick={openAudience}>{t('present.audience')}</Button>
          {confirming ? (
            <>
              <Button variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" className="presenter__end-confirm" onClick={() => room.endPresentation().catch(() => undefined)}>{t('present.endConfirm')}</Button>
            </>
          ) : (
            <Button variant="subtle" className="presenter__end" icon={<Square size={14} />} onClick={() => setConfirming(true)}>{t('present.end')}</Button>
          )}
        </div>
        <p className="field__help presenter__keys">{t('present.keys')}</p>
      </div>
      <aside className="presenter__side">
        <p className="presenter__followers" data-count={followers}><Users size={16} aria-hidden="true" /> {t('present.following', { count: followers })}</p>
        <section className="presenter__next-slide" aria-labelledby="present-next">
          <h3 id="present-next" className="presenter__label">{t('present.upNext')}</h3>
          {upcoming ? (
            upcoming.image ? (
              <img src={upcoming.image} alt={t('present.slideAlt', { n: state.position + 2, count: state.count })} width={480} height={270} />
            ) : (
              <p className="presenter__next-question" dir="auto">{upcoming.question}</p>
            )
          ) : (
            <p className="field__help">{t('present.lastSlide')}</p>
          )}
        </section>
        <section className="presenter__notes" aria-labelledby="present-notes">
          <h3 id="present-notes" className="presenter__label"><StickyNote size={14} aria-hidden="true" /> {t('present.notes')}</h3>
          {notes?.slideId === state.slide.slideId && notes.notes ? (
            <p className="presenter__notes-text" dir="auto">{notes.notes}</p>
          ) : (
            <p className="field__help">{t('present.noNotes')}</p>
          )}
        </section>
      </aside>
    </section>
  )
}
