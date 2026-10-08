import { Outlet, useLocation } from 'react-router'
import { SiteHeader } from '../../components/SiteHeader'
import { PirikooChat } from '../pirikoo/PirikooChat'
import '../../styles/app.css'

/**
 * Participants without an account get the room without the app chrome: the public site's white bar (its larger
 * wordmark, the language pill, a hairline under it) and the circle.
 */
export default function GuestShell() {
  const { pathname } = useLocation()
  // A guest's identity is their membership of this one circle; another circle starts a fresh conversation.
  const circleId = /^\/c\/([0-9a-f-]{36})/.exec(pathname)?.[1] ?? null
  return (
    <div className="guest">
      <SiteHeader />
      <main id="main" className="guest__main">
        <Outlet />
      </main>
      <PirikooChat owner={circleId ? `guest:${circleId}` : null} guest />
    </div>
  )
}
