import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from '../../../lib/motion'
import { useRoom } from '../room'
import { REACTION_EMOJI, REACTION_KINDS, sendWindow, type ReactionKind } from './reactions'
import '../../../styles/reactions.css'

/**
 * The six reactions under the slide, for participants and the animator alike (spec 008 US4). One tap sends; the button
 * answers at once (the emoji hops off it, or under reduced motion the button lights up), because the hub never says
 * whether a tap counted. After five taps in ten seconds, the hub's limit, the bar rests with a kind line until the
 * oldest tap is ten seconds old. Hidden when the animator switched reactions off. Mount it only while a presentation
 * runs.
 */
export function ReactionBar({ className }: { className?: string }) {
  const { t } = useTranslation()
  const on = useRoom((s) => s.settings.reactions)
  const reduced = useReducedMotion()
  const [pops, setPops] = useState<{ id: number; kind: ReactionKind }[]>([])
  const [lit, setLit] = useState<ReactionKind | null>(null)
  const [resting, setResting] = useState(false)
  const [sent] = useState(() => sendWindow())
  const popId = useRef(0)
  const restTimer = useRef<number | undefined>(undefined)
  const litTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(restTimer.current)
      window.clearTimeout(litTimer.current)
    },
    [],
  )

  if (!on) return null

  /** Rests until the oldest of the last five taps leaves the window, then checks again. */
  const rest = () => {
    const wait = sent.restFor()
    setResting(wait > 0)
    window.clearTimeout(restTimer.current)
    if (wait > 0) restTimer.current = window.setTimeout(rest, wait + 50)
  }

  const tap = (kind: ReactionKind) => {
    // Over the limit the hub would drop it anyway: nothing is sent and the hint stays.
    if (!sent.take()) return
    useRoom.getState().react(kind)
    if (reduced) {
      setLit(kind)
      window.clearTimeout(litTimer.current)
      litTimer.current = window.setTimeout(() => setLit(null), 400)
    } else {
      const id = ++popId.current
      setPops((p) => [...p.slice(-5), { id, kind }])
    }
    rest()
  }

  return (
    <div className={['reaction-bar', resting ? 'is-resting' : '', className].filter(Boolean).join(' ')} role="group" aria-label={t('circles.reactions.bar')}>
      <div className="reaction-bar__buttons">
        {REACTION_KINDS.map((kind) => (
          <button key={kind} type="button" data-kind={kind} className={['reaction-bar__btn', lit === kind ? 'is-sent' : ''].filter(Boolean).join(' ')}
            aria-label={t(`circles.reactions.kinds.${kind}`)} aria-disabled={resting || undefined} onClick={() => tap(kind)}>
            <span className="reaction-bar__emoji" aria-hidden="true">{REACTION_EMOJI[kind]}</span>
            {pops.filter((p) => p.kind === kind).map((p) => (
              <span key={p.id} className="reaction-bar__pop" aria-hidden="true"
                onAnimationEnd={() => setPops((all) => all.filter((x) => x.id !== p.id))}>
                {REACTION_EMOJI[kind]}
              </span>
            ))}
          </button>
        ))}
      </div>
      {/* Always in the page, so the hint is announced when it appears; empty, it takes no room. */}
      <p className="reaction-bar__hint" role="status">{resting ? t('circles.reactions.rest') : ''}</p>
    </div>
  )
}
