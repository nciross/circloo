import { useHandsAnnouncement } from './useHandsAnnouncement'

/** The polite line for hands; mount it where it stays in the page, outside a tab panel that can be hidden. */
export function HandsAnnouncer() {
  const said = useHandsAnnouncement()
  return <p className="visually-hidden" role="status" data-slot="hands-say">{said}</p>
}
