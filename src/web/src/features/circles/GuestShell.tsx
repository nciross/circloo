import { Outlet } from 'react-router'
import { SiteHeader } from '../../components/SiteHeader'
import '../../styles/app.css'

/** Participants without an account get the room without the app chrome: brand, language, and the circle. */
export default function GuestShell() {
  return (
    <div className="guest">
      <SiteHeader />
      <main id="main" className="guest__main">
        <Outlet />
      </main>
    </div>
  )
}
