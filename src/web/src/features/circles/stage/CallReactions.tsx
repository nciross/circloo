import { useRoom } from '../room'
import { ReactionLayer } from '../room/ReactionLayer'
import { ReactionTally } from '../room/ReactionTally'
import { useReactions } from '../room/reactions'
import '../../../styles/reactions.css'

/**
 * Reactions over the call (spec 009 US8, T927), on every screen in it: spec 008's grouped bursts rise from the call's bar
 * over whatever the centre shows, the grid or the round, in a lane at the inline end, and the "👏 ×20" chips sit just
 * above the bar. Under reduced motion nothing rises and the chips are the counter; screen readers hear the chips' polite
 * summary at most every few seconds. Nothing takes a pointer. Hidden when the animator switched reactions off.
 */
export function CallReactions() {
  const on = useRoom((s) => s.settings.reactions)
  const bursts = useReactions((s) => s.bursts)
  const waves = useReactions((s) => s.waves)
  const totals = useReactions((s) => s.totals)
  if (!on) return null
  return (
    <div className="call-reactions" data-slot="call-reactions">
      <ReactionLayer bursts={bursts} className="call-reactions__layer" />
      <ReactionTally waves={waves} totals={totals} className="call-reactions__tally" />
    </div>
  )
}
