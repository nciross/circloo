import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Mood } from './MoodIcon'

/*
 * The circloo face. The last "oo" of the name are two eyes and a mouth sits under them, so the
 * logo can feel what people feel: its mouth follows the five check-in moods (stormy to sunny),
 * its pupils follow the pointer and it blinks now and then. Geometry is in a 60 × 50 box where
 * 50 units = 1em: the eyes are exactly one x-height tall and sit on the text baseline (y = 37).
 */
const EYE_R = 11
const EYES = [15.25, 43.75] as const
const EYE_Y = 23.75

/** Mouth curves, frown to grin. Every path has the same commands so browsers that animate `d` morph between them. */
const MOUTHS: Record<Mood, string> = {
  1: 'M18 47 Q23.75 41 29.5 41 Q35.25 41 41 47',
  2: 'M18 45 Q24 42.5 29.5 44.5 Q35 46.5 41 43.5',
  3: 'M18 44 Q23.75 44 29.5 44 Q35.25 44 41 44',
  4: 'M16 42 Q22 47.5 29.5 47.5 Q37 47.5 43 42',
  5: 'M13 40 Q20 51 29.5 51 Q39 51 46 40',
}

/** Pupils look toward the pointer (decorative; still when reduced motion is on, unless the page forces it). */
export type Gaze = boolean | 'force'
function useGaze(enabled: Gaze) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg || !enabled || (enabled !== 'force' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = svg.getBoundingClientRect()
        const dx = e.clientX - (box.left + box.width * 0.5)
        const dy = e.clientY - (box.top + box.height * 0.45)
        const len = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, len / 240) * 4.2
        svg.style.setProperty('--gx', `${(dx / len) * reach}px`)
        svg.style.setProperty('--gy', `${(dy / len) * reach}px`)
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [enabled])
  return ref
}

/** The two eyes and the mouth on their own: the mark (favicon, avatar of circloo, watermark). */
export function FaceMark({ mood = 4, className, interactive = false, title }: { mood?: Mood; className?: string; interactive?: Gaze; title?: string }) {
  const ref = useGaze(interactive)
  return (
    <svg
      ref={ref}
      className={['face', className].filter(Boolean).join(' ')}
      viewBox="1 9 57 47"
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    >
      <FaceParts mood={mood} />
    </svg>
  )
}

function FaceParts({ mood }: { mood: Mood }) {
  return (
    <>
      <g className="face__eyes">
        {EYES.map((x) => (
          <g key={x} className="face__eye">
            <circle className="face__ring" cx={x} cy={EYE_Y} r={EYE_R} strokeWidth="4.6" />
            <circle className="face__pupil" cx={x} cy={EYE_Y + 0.5} r="3.4" />
          </g>
        ))}
      </g>
      <path className="face__mouth" d={MOUTHS[mood]} strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** "circl" in type, then the face as "oo". Reads as one word to assistive tech. */
export function Wordmark({ mood = 4, interactive = true, className }: { mood?: Mood; interactive?: boolean; className?: string }) {
  const ref = useGaze(interactive)
  return (
    <span className={['wordmark', className].filter(Boolean).join(' ')} dir="ltr">
      <span className="wordmark__text" aria-hidden="true">circl</span>
      <svg ref={ref} className="face wordmark__face" viewBox="0 0 60 50" fill="none" aria-hidden="true" focusable="false">
        <FaceParts mood={mood} />
      </svg>
    </span>
  )
}

/** The lockup: always a link home. The face grins when you come close. */
export function Brand({ to = '/' }: { to?: string }) {
  const { t } = useTranslation()
  const [near, setNear] = useState(false)
  return (
    <Link
      to={to}
      className="brand"
      aria-label={t('common.brand')}
      viewTransition
      onPointerEnter={() => setNear(true)}
      onPointerLeave={() => setNear(false)}
      onFocus={() => setNear(true)}
      onBlur={() => setNear(false)}
    >
      <Wordmark mood={near ? 5 : 4} />
    </Link>
  )
}
