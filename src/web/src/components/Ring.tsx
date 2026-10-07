import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import type { AnyCharacter } from './characters'
import { Character } from './Character'
import type { Mood } from './MoodIcon'
import { dur, easeOut, spring, useReducedMotion } from '../lib/motion'
import '../styles/ring.css'

/*
 * The orrery's signature: a circle drawn as a ring. The members are bodies on the brass track, the
 * inside is filled with the circle's sky (its mood today), and a brass arc runs while a round is live.
 * Bodies sit in arrival order from the top, clockwise in LTR and counter-clockwise in RTL.
 */
export interface RingBody {
  id: string
  character: AnyCharacter
  name: string
  ring?: number
  me?: boolean
}

export interface RingProps {
  /** Large on Home (bodies 40px), small in lists and the work bar (bodies 24px). */
  size?: 'lg' | 'sm'
  bodies: RingBody[]
  /** Total members, when more than the bodies given (the rest become "+n"). */
  people?: number
  /** Today's mood of the circle; no mood leaves the inside on paper. */
  mood?: Mood | null
  /** Share of the running round already elapsed (0–1); undefined when idle. */
  progress?: number
  closed?: boolean
  /** What the ring says to assistive technology, e.g. "Family dinner: 6 members, mostly bright". */
  label: string
  /** Shown in the centre: a numeral (today's readings) or anything small. */
  children?: React.ReactNode
  /** Draw the track and bring the bodies in one by one (Home's focal entrance). */
  compose?: boolean
  className?: string
}

const MAX_BODIES = 12
const SKY: Record<Mood, string> = { 1: 'stormy', 2: 'foggy', 3: 'cloudy', 4: 'bright', 5: 'sunny' }

export function Ring({ size = 'lg', bodies, people, mood, progress, closed, label, children, compose = false, className }: RingProps) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const titleId = useId()
  const shown = bodies.slice(0, MAX_BODIES)
  const total = Math.max(people ?? bodies.length, bodies.length)
  const extra = total - shown.length
  const slots = shown.length + (extra > 0 ? 1 : 0)
  const running = progress !== undefined && !closed
  const classes = ['ring', `ring--${size}`, mood ? `ring--${SKY[mood]}` : '', closed ? 'is-closed' : '', running ? 'is-running' : '', className]
    .filter(Boolean)
    .join(' ')
  const trackTransition = reduced ? { duration: dur.state } : { duration: dur.focal, ease: easeOut }
  return (
    <div className={classes} role="img" aria-labelledby={titleId}>
      <span id={titleId} className="visually-hidden">{label}</span>
      <svg className="ring__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="ring__sky" cx="50" cy="50" r="38" />
        <motion.circle
          className="ring__track"
          cx="50"
          cy="50"
          r="46"
          pathLength={100}
          initial={compose ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={trackTransition}
        />
        {running ? (
          <motion.circle
            className="ring__run"
            cx="50"
            cy="50"
            r="46"
            pathLength={100}
            initial={false}
            animate={{ pathLength: Math.max(0.02, Math.min(1, progress ?? 0)) }}
            transition={reduced ? { duration: dur.state } : spring.gentle}
          />
        ) : null}
        <line className="ring__tick" x1="50" y1="2" x2="50" y2="7" />
      </svg>
      <ul className="ring__bodies" aria-hidden="true">
        {shown.map((b, i) => (
          <Body key={b.id} index={i} slots={slots} reduced={reduced} compose={compose} me={b.me}>
            <Character id={b.character} ring={b.ring ?? 0} className="ring__char" tag={false} />
          </Body>
        ))}
        {extra > 0 ? (
          <Body index={shown.length} slots={slots} reduced={reduced} compose={compose}>
            <span className="ring__more">+{extra}</span>
          </Body>
        ) : null}
      </ul>
      {children ? <div className="ring__centre">{children}</div> : null}
      {total === 0 ? <span className="ring__empty">{t('circles.ring.empty')}</span> : null}
    </div>
  )
}

/** One body on the track: the li is positioned by angle through a custom property (so RTL can mirror in
 *  CSS) and never animated by Motion, which would write its own inline transform; the hop lives on an inner span. */
function Body({ index, slots, reduced, compose, me, children }: { index: number; slots: number; reduced: boolean; compose: boolean; me?: boolean; children: React.ReactNode }) {
  const angle = (index / slots) * 360
  return (
    <li className={`ring__body${me ? ' is-me' : ''}`} style={{ ['--angle' as string]: `${angle}deg` }}>
      <motion.span
        className="ring__hop"
        initial={compose ? (reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }) : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduced ? { duration: dur.state, delay: 0 } : { ...spring.snappy, delay: Math.min(0.32, 0.2 + index * 0.04) }}
      >
        {children}
      </motion.span>
    </li>
  )
}
