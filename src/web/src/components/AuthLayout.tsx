import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { SiteHeader } from './SiteHeader'
import { FaceMark } from './Brand'

/** Sign-in and first-run screens: one centred card on a quiet canvas, the ring mark as watermark. */
export function AuthLayout({ children, homeTo = '/', showLanguages = true, note = true }: { children: ReactNode; homeTo?: string; showLanguages?: boolean; note?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="auth">
      <SiteHeader homeTo={homeTo} showLanguages={showLanguages} />
      <main id="main" className="auth__main">
        <FaceMark className="auth__watermark" />
        <div className="auth__card">{children}</div>
        {note ? (
          <p className="auth__note">
            <Lock size={14} aria-hidden="true" /> {t('auth.aside')}
          </p>
        ) : null}
      </main>
    </div>
  )
}
