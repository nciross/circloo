import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize, Minimize } from 'lucide-react'
import { Button } from '../../../components/Button'
import { Panda } from '../../../components/Panda'
import { useLive } from './presentation'
import { SlideStage } from './SlideStage'
import { AnswerPad } from './AnswerPad'

/**
 * What participants see (spec 006 US3 #5, US4): the current slide fitted to the screen, following the animator, and on
 * a question the answer pad. No way to move or to see notes; a full-screen button for phones and laptops alike. Where
 * the browser has no full-screen API (iPhone Safari), the slide fills the window instead.
 */
export function ParticipantView() {
  const { t } = useTranslation()
  const state = useLive((s) => s.state)
  const frame = useRef<HTMLDivElement>(null)
  const [native, setNative] = useState(false)
  const [filled, setFilled] = useState(false)
  const canNative = typeof document !== 'undefined' && document.fullscreenEnabled
  const full = native || filled

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!filled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilled(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filled])

  if (!state) {
    return (
      <section className="panel room__wait" aria-live="polite">
        <div className="panel__body">
          <Panda thinking className="room__wait-panda" />
          <h2 className="panel__title">{t('present.waitTitle')}</h2>
          <p className="field__help">{t('present.waitBody')}</p>
        </div>
      </section>
    )
  }

  const toggleFull = () => {
    if (!canNative) {
      setFilled((f) => !f)
      return
    }
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  return (
    <section className="follow" aria-labelledby="follow-title">
      <h2 id="follow-title" className="visually-hidden" dir="auto">{state.presentationName}</h2>
      <div ref={frame} className={['follow__frame', filled ? 'is-filled' : ''].filter(Boolean).join(' ')}>
        {state.slide.kind !== 'deck' && !state.blank ? (
          <AnswerPad key={state.slide.slideId} state={state} slide={state.slide} />
        ) : (
          <SlideStage state={state} className="follow__stage" />
        )}
        <Button size="sm" variant="subtle" className="follow__full" icon={full ? <Minimize size={16} /> : <Maximize size={16} />}
          aria-label={full ? t('present.exitFullscreen') : t('present.fullscreen')} onClick={toggleFull} />
      </div>
      <p className="follow__count" aria-live="polite">{t('present.counter', { n: state.position + 1, total: state.count })}</p>
    </section>
  )
}
