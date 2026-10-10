import { useEffect, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '../../../lib/motion'
import { MAX_MOVING, REACTION_EMOJI, jitter, spawn, type BurstEntry, type ReactionKind } from './reactions'
import '../../../styles/reactions.css'

interface Float {
  key: string
  kind: ReactionKind
  /** Where in the lane (0 = its inline end), how far it sways (em), its delay and duration (ms). */
  x: number
  drift: number
  delay: number
  dur: number
  /** When its burst arrived, so a float whose animation never ended (a hidden tab) still leaves. */
  at: number
}

/** A float is gone this long after its burst at the latest, whatever its animation did. */
const MAX_LIFE = 3600

function floatsFor(entry: BurstEntry, kinds: ReactionKind[]): Float[] {
  // Spread one burst over the 400 ms until the next, so 12 emoji rise as a flurry, not as one block.
  return kinds.map((kind, i) => {
    const r = jitter(entry.id, i)
    return {
      key: `${entry.id}-${i}`,
      kind,
      x: Math.round(r * 100) / 100,
      drift: Math.round((jitter(i, entry.id) - 0.5) * 120) / 100,
      delay: Math.round((i / kinds.length) * 360 + r * 40),
      dur: Math.round(2000 + jitter(entry.id + 7, i) * 400),
      at: entry.at,
    }
  })
}

/**
 * Reactions floating up over a surface (spec 008 US4): put it inside any positioned container (the slide stage, the
 * audience screen's stage, later the call grid of spec 009) and give it the bursts to play. Emoji rise from the bottom
 * edge in a lane along the inline end and shrink away in about two seconds; at most 12 move at once and the rest only
 * count in the `ReactionTally` beside the surface. It moves by transform alone, never covers anything clickable (no
 * pointer events, and hosts keep it off answer buttons and controls) and is hidden from assistive technology, which
 * hears the tally's summary instead. Under reduced motion nothing floats: the tally carries the reactions alone.
 * The lane is set with `--reaction-lane-end` and `--reaction-lane-width` on any ancestor.
 */
export function ReactionLayer({ bursts, className }: { bursts: readonly BurstEntry[]; className?: string }) {
  const reduced = useReducedMotion()
  const latest = bursts.at(-1)?.id ?? 0
  // Bursts that arrived before this layer showed are history, not something to play now.
  const [seen, setSeen] = useState(latest)
  const [floats, setFloats] = useState<Float[]>([])

  if (latest !== seen) {
    setSeen(latest)
    if (!reduced) {
      let free = MAX_MOVING - floats.length
      const added: Float[] = []
      for (const entry of bursts) {
        if (entry.id <= seen || free <= 0) continue
        const kinds = spawn(entry.burst, free)
        free -= kinds.length
        added.push(...floatsFor(entry, kinds))
      }
      if (added.length > 0) setFloats([...floats, ...added])
    }
  }

  // A float whose animation never ended (a hidden tab, an interrupted animation) still frees its slot.
  useEffect(() => {
    if (floats.length === 0) return
    const oldest = Math.min(...floats.map((f) => f.at))
    const timer = window.setTimeout(() => setFloats((all) => all.filter((f) => Date.now() - f.at < MAX_LIFE)), Math.max(0, oldest + MAX_LIFE - Date.now()) + 50)
    return () => window.clearTimeout(timer)
  }, [floats])

  if (reduced) return null
  return (
    <div className={['reaction-layer', className].filter(Boolean).join(' ')} aria-hidden="true" data-moving={floats.length}>
      {floats.map((f) => (
        <span key={f.key} className="reaction-layer__float" data-kind={f.kind}
          style={{ '--x': f.x, '--drift': `${f.drift}em`, '--delay': `${f.delay}ms`, '--dur': `${f.dur}ms` } as CSSProperties}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setFloats((all) => all.filter((x) => x.key !== f.key))
          }}>
          <span className="reaction-layer__emoji">{REACTION_EMOJI[f.kind]}</span>
        </span>
      ))}
    </div>
  )
}
