import { useLayoutEffect, useRef } from 'react'
import { useRoom } from '../room'
import { ReactionLayer } from '../room/ReactionLayer'
import { ReactionTally } from '../room/ReactionTally'
import { useReactions } from '../room/reactions'
import { useStage } from './stage'
import '../../../styles/reactions.css'

/**
 * Reactions over the call (spec 009 US8, T927), on every screen in it: spec 008's grouped bursts rise from the call's bar
 * over whatever the centre shows, the grid or the round, in a lane at the inline end, and the "👏 ×20" chips sit just
 * above the bar. Under reduced motion nothing rises and the chips are the counter; screen readers hear the chips' polite
 * summary at most every few seconds. Nothing takes a pointer. Hidden when the animator switched reactions off.
 * While a call notice shows above the bar, the chips sit above the notice instead of over its edge and its Dismiss (T914).
 */
export function CallReactions() {
  const on = useRoom((s) => s.settings.reactions)
  const bursts = useReactions((s) => s.bursts)
  const waves = useReactions((s) => s.waves)
  const totals = useReactions((s) => s.totals)
  const notices = useStage((s) => s.notices)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const own = ref.current
    const bar = own?.closest('.call-bar')
    const notice = bar?.parentElement?.querySelector<HTMLElement>(':scope > .call-notice:not(.is-empty)')
    if (!own || !bar) return
    const lift = () => {
      const n = notice?.getBoundingClientRect()
      const b = bar.getBoundingClientRect()
      // Only a notice right above the bar is in the chips' way.
      const gap = n ? b.top - n.top : 0
      own.style.setProperty('--notice-lift', `${gap > 0 && gap < 240 ? Math.round(gap) : 0}px`)
    }
    lift()
    if (!notice || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(lift)
    watch.observe(notice)
    return () => watch.disconnect()
  }, [notices, on])

  if (!on) return null
  return (
    <div ref={ref} className="call-reactions" data-slot="call-reactions">
      <ReactionLayer bursts={bursts} className="call-reactions__layer" />
      <ReactionTally waves={waves} totals={totals} className="call-reactions__tally" />
    </div>
  )
}
