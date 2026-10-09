import { useCallAnnouncement } from './announce'

/**
 * The room's one polite line for the call and the hands (`announce.ts`). Mount it where it stays in the page, outside a
 * tab panel that can be hidden and outside the call's bar, so it speaks whether the call is joined or not.
 */
export function CallAnnouncer() {
  const said = useCallAnnouncement()
  return <p className="visually-hidden" role="status" data-slot="room-say">{said}</p>
}
