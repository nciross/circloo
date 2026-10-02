import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { useUiStore } from '../../stores/ui'

/** The story, in order. Each step has a silent clip per language, rendered with Remotion (video/render-clips.mjs). */
const STORY = ['circle', 'chat', 'canvas', 'board', 'send', 'pirikoo'] as const
type StepId = (typeof STORY)[number]
/** Clips with no words in them: one file serves every language. */
const WORDLESS: ReadonlySet<StepId> = new Set(['circle', 'send'])

interface StepCopy { label: string; title: string; body: string; video: string }

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One story clip. It downloads nothing until it gets close to the screen, then plays muted while at least half of
 * it is visible and pauses once it leaves. Under reduced motion it stays on its poster until someone presses play.
 * The button pauses it for good: scrolling back never restarts a clip someone stopped.
 */
function StoryClip({ step, description }: { step: StepId; description: string }) {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const ref = useRef<HTMLVideoElement>(null)
  const descId = useId()
  const file = `/video/story/${WORDLESS.has(step) ? step : `${step}-${locale}`}`
  const [near, setNear] = useState(() => !('IntersectionObserver' in window))
  const [playing, setPlaying] = useState(false)
  const [stopped, setStopped] = useState(() => reducedMotion())

  // Load the poster and the video once the clip is about a screen away.
  useEffect(() => {
    const video = ref.current
    if (near || !video) return
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    io.observe(video)
    return () => io.disconnect()
  }, [near])

  // Play while on screen, unless someone stopped it.
  useEffect(() => {
    const video = ref.current
    if (!near || stopped || !video || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => undefined)
        else video.pause()
      },
      { threshold: 0.5 },
    )
    io.observe(video)
    return () => {
      io.disconnect()
      video.pause()
    }
  }, [near, stopped, locale])

  const toggle = () => {
    const video = ref.current
    if (!video) return
    if (video.paused) {
      setStopped(false)
      void video.play().catch(() => undefined)
    } else {
      setStopped(true)
      video.pause()
    }
  }

  return (
    <figure className="chapter__media">
      <video
        key={locale}
        ref={ref}
        className="chapter__video"
        src={near ? `${file}.mp4` : undefined}
        poster={near ? `${file}.jpg` : undefined}
        muted
        loop
        playsInline
        preload="none"
        width={960}
        height={540}
        aria-describedby={descId}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button type="button" className="chapter__toggle" onClick={toggle} aria-label={playing ? t('landing.story.pause') : t('landing.story.play')}>
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <figcaption id={descId} className="visually-hidden">{description}</figcaption>
    </figure>
  )
}

/**
 * The landing's centrepiece: six short moments of one circle, from the first hello to the follow-up. Each chapter
 * pins its clip while its words scroll by, then hands over to the next one. Nothing hijacks the scroll: pinning is
 * plain `position: sticky`, and the step bar above only follows along and offers anchors.
 */
export function Story() {
  const { t } = useTranslation()
  const steps = t('landing.story.steps', { returnObjects: true }) as Record<StepId, StepCopy>
  const [active, setActive] = useState<StepId>(STORY[0])
  const listRef = useRef<HTMLOListElement>(null)

  // The chapter crossing the middle of the screen is the current step.
  useEffect(() => {
    const list = listRef.current
    if (!list || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)
        if (hit) setActive(hit.target.getAttribute('data-step') as StepId)
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    list.querySelectorAll('.chapter').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const index = STORY.indexOf(active)

  return (
    <section id="story" className="story" aria-labelledby="story-title">
      <div className="story__head">
        <h2 id="story-title" className="section-title">{t('landing.story.title')}</h2>
        <p>{t('landing.story.lead')}</p>
      </div>

      <nav className="story__bar" aria-label={t('landing.story.nav')} style={{ '--story-progress': (index + 1) / STORY.length } as CSSProperties}>
        <ol className="story__steps">
          {STORY.map((id, i) => (
            <li key={id}>
              <a href={`#story-${id}`} className="story__step" aria-current={id === active ? 'step' : undefined}>
                <span className="story__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <span className="story__label">{steps[id].label}</span>
              </a>
            </li>
          ))}
        </ol>
        <p className="story__now" aria-hidden="true">{steps[active].label}</p>
      </nav>

      <ol ref={listRef} className="story__list">
        {STORY.map((id, i) => (
          <li key={id} id={`story-${id}`} data-step={id} className="chapter">
            <div className="chapter__copy">
              <p className="chapter__kicker"><span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span> {steps[id].label}</p>
              <h3 className="chapter__title">{steps[id].title}</h3>
              <p className="chapter__body">{steps[id].body}</p>
            </div>
            <StoryClip step={id} description={steps[id].video} />
          </li>
        ))}
      </ol>
    </section>
  )
}
