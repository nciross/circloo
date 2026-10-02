import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../stores/ui'

/**
 * The 20-second tour, rendered with Remotion (see /video) in the person's language. It's silent; the caption says
 * what it shows for people who can't watch it. With `whileVisible` it plays muted while on screen and pauses off
 * screen, and never starts by itself under reduced motion. Otherwise it waits for the play button and downloads
 * nothing before then.
 */
export function TourVideo({ whileVisible = false, hideCaption = false, className }: { whileVisible?: boolean; hideCaption?: boolean; className?: string }) {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const ref = useRef<HTMLVideoElement>(null)
  const captionId = useId()

  useEffect(() => {
    const video = ref.current
    if (!whileVisible || !video || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined)
        else video.pause()
      },
      { threshold: 0.5 },
    )
    io.observe(video)
    return () => io.disconnect()
  }, [locale, whileVisible])

  return (
    <figure className={['tour-video', className].filter(Boolean).join(' ')}>
      <video
        key={locale}
        ref={ref}
        className="tour-video__player"
        src={`/video/circloo-tour-${locale}.mp4`}
        poster={`/video/circloo-tour-${locale}.jpg`}
        muted
        loop={whileVisible}
        playsInline
        controls
        preload={whileVisible ? 'metadata' : 'none'}
        width={1280}
        height={720}
        aria-describedby={captionId}
      />
      <figcaption id={captionId} className={hideCaption ? 'visually-hidden' : 'tour-video__caption'}>{t('landing.tour.description')}</figcaption>
    </figure>
  )
}
