import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { useUiStore } from '../../stores/ui'
import { useLandingMotion } from './motion'
import { Band } from './Band'

/** The story, in order. Each step has a silent clip per language, rendered with Remotion (video/render-clips.mjs). */
const STORY = ['circle', 'chat', 'canvas', 'board', 'send', 'pirikoo'] as const
type StepId = (typeof STORY)[number]
/** Clips with no words in them: one file serves every language. */
const WORDLESS: ReadonlySet<StepId> = new Set(['circle', 'send'])

interface StepCopy { label: string; title: string; body: string; video: string }

/**
 * One player for the six chapters (#247, band rhythm #250): a dark band with the chapters as a vertical list at the
 * start and the clip in a dark frame at the end. The open chapter shows its line and its body and draws the clip's
 * progress along its edge; the others fold to their titles. With motion on, a chapter plays muted while the frame
 * is on screen and the next one follows when it ends; otherwise a clip stays on its poster until someone presses
 * play. Nothing downloads until the frame gets close, and a language switch swaps the file.
 */
export function Player({ still }: { still: boolean }) {
  const { t } = useTranslation()
  const locale = useUiStore((s) => s.locale)
  const { on } = useLandingMotion()
  const steps = t('landing.story.steps', { returnObjects: true }) as Record<StepId, StepCopy>
  const descId = useId()
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState<StepId>(STORY[0])
  const [near, setNear] = useState(() => !('IntersectionObserver' in window))
  const [visible, setVisible] = useState(false)
  // A press overrides the page default until motion turns on or off again.
  const [choice, setChoice] = useState<{ on: boolean; stopped: boolean } | null>(null)
  // Both belong to the clip on screen: the element remounts per chapter and language, and the old one never reports
  // that it stopped, so a blocked autoplay on the next clip must not inherit "playing" or a full progress line.
  const clip = `${active}-${locale}`
  const [playingClip, setPlayingClip] = useState<string | null>(null)
  const [progress, setProgress] = useState({ clip: '', p: 0 })
  const playing = playingClip === clip
  const auto = on && !still
  const stopped = choice && choice.on === auto ? choice.stopped : !auto
  const file = `/video/story/${WORDLESS.has(active) ? active : clip}`

  useEffect(() => {
    const el = stageRef.current
    if (near || !el) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    const el = stageRef.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setVisible(Boolean(e?.isIntersecting)), { threshold: 0.5 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Play while on screen, unless someone stopped it. The element remounts per chapter and language.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !near) return
    if (visible && !stopped) void v.play().catch(() => undefined)
    else v.pause()
  }, [near, visible, stopped, active, locale])

  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      setChoice({ on: auto, stopped: false })
      void v.play().catch(() => undefined)
    } else {
      setChoice({ on: auto, stopped: true })
      v.pause()
    }
  }

  const label = steps[active].label
  return (
    <Band id="story" tone="dark" className="film" labelledBy="story-title">
      <div className="film__grid">
        <div className="film__side">
          <div className="band__head-copy">
            <p className="eyebrow">{t('landing.story.eyebrow')}</p>
            <h2 id="story-title" className="band__title">{t('landing.story.title')}</h2>
            <p className="band__lead">{t('landing.story.lead')}</p>
          </div>
          <ol className="film__chapters" aria-label={t('landing.story.nav')}>
            {STORY.map((id, i) => {
              const current = id === active
              return (
                <li key={id} id={`story-${id}`} className={`film__chapter${current ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="film__pick"
                    aria-current={current ? 'true' : undefined}
                    aria-expanded={current}
                    style={{ '--p': current && progress.clip === clip ? progress.p : 0 } as CSSProperties}
                    onClick={() => setActive(id)}
                  >
                    <span className="film__label"><span className="film__index">{String(i + 1).padStart(2, '0')}</span> {steps[id].label}</span>
                    <span className="film__line">{steps[id].title}</span>
                    <span className="film__bar" aria-hidden="true"><span /></span>
                  </button>
                  {current ? <p className="film__body">{steps[id].body}</p> : null}
                </li>
              )
            })}
          </ol>
        </div>
        <div ref={stageRef} className="film__stage">
          <div className="film__chrome" aria-hidden="true">
            <span className="film__dot" /><span className="film__dot" /><span className="film__dot" />
            <span className="film__chrome-title">{label}</span>
          </div>
          <video
            key={clip}
            ref={videoRef}
            className="film__video"
            src={near ? `${file}.mp4` : undefined}
            poster={near ? `${file}.jpg` : undefined}
            muted
            playsInline
            preload="none"
            width={960}
            height={540}
            aria-describedby={descId}
            onPlay={() => setPlayingClip(clip)}
            onPause={() => setPlayingClip((c) => (c === clip ? null : c))}
            onTimeUpdate={(e) => {
              const v = e.currentTarget
              if (v.duration) setProgress({ clip, p: v.currentTime / v.duration })
            }}
            onEnded={() => {
              if (!stopped) setActive(STORY[(STORY.indexOf(active) + 1) % STORY.length]!)
            }}
          />
          <p id={descId} className="visually-hidden">{steps[active].video}</p>
          <button type="button" className="film__toggle" onClick={toggle} aria-label={t(playing ? 'landing.story.pause' : 'landing.story.play', { step: label })}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </Band>
  )
}
