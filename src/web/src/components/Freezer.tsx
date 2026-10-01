import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageMagnets } from './LanguageMagnets'

/** The freezer compartment on top of the door: brand, languages and the account corner. */
export function Freezer({ children, homeTo = '/' }: { children?: ReactNode; homeTo?: string }) {
  const { t } = useTranslation()
  return (
    <header className="freezer">
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <div className="freezer__inner">
        <Link to={homeTo} className="freezer__brand" aria-label={t('common.brand')}>
          circloo
        </Link>
        <div className="freezer__end">
          <LanguageMagnets />
          {children}
        </div>
      </div>
    </header>
  )
}
