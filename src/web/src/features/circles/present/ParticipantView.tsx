import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize, Minimize } from 'lucide-react'
import { Button } from '../../../components/Button'
import { Panda } from '../../../components/Panda'
import { useLive } from './presentation'
import { SlideStage } from './SlideStage'

/**
 * What participants see (spec 006 US3 #5): the current slide fitted to the screen, following the animator. No way to
 * move or to see notes; a full-screen button for phones and laptops alike.
 */
export function ParticipantView() {
  const { t } = useTranslation()
  const state = useLive((s) => s.state)
  const frame = useRef<HTMLDivElement>(null)
  const [full, setFull] = useState(false)

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

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
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  return (
    <section className="follow" aria-label={state.presentationName}>
      <div ref={frame} className="follow__frame">
        <SlideStage state={state} className="follow__stage" />
        {document.fullscreenEnabled ? (
          <Button size="sm" variant="subtle" className="follow__full" icon={full ? <Minimize size={16} /> : <Maximize size={16} />}
            aria-label={full ? t('present.exitFullscreen') : t('present.fullscreen')} onClick={toggleFull} />
        ) : null}
      </div>
      <p className="follow__count" aria-live="polite">{t('present.counter', { n: state.position + 1, count: state.count })}</p>
    </section>
  )
}
