import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../../stores/ui'

/**
 * The 20-second tour, rendered with Remotion (see /video) in the visitor's language. Silent, so it plays muted
 * while on screen and pauses off screen; with reduced motion it never starts by itself. The description
 * below the player says what the video shows for people who cannot watch it.
 */
export function Tour() {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined)
        else video.pause()
      },
      { threshold: 0.5 },
    )
    io.observe(video)
    return () => io.disconnect()
  }, [locale])

  return (
    <section className="band tour" aria-labelledby="tour-title">
      <div className="band__inner tour__inner">
        <div className="section-head tour__head">
          <h2 id="tour-title" className="section-title">{t('landing.tour.title')}</h2>
          <p>{t('landing.tour.lead')}</p>
        </div>
        <figure className="tour__frame">
          <video
            key={locale}
            ref={ref}
            className="tour__video"
            src={`/video/circloo-tour-${locale}.mp4`}
            poster={`/video/circloo-tour-${locale}.jpg`}
            muted
            loop
            playsInline
            controls
            preload="metadata"
            width={1280}
            height={720}
            aria-describedby="tour-description"
          />
          <figcaption id="tour-description" className="tour__description">{t('landing.tour.description')}</figcaption>
        </figure>
      </div>
    </section>
  )
}
