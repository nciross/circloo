import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Brand } from './Brand'
import { LanguageMenu } from './LanguageMenu'

/** The public top bar: lockup and optional site links at the start, language and account actions at the end. */
export function SiteHeader({ children, links, homeTo = '/', showLanguages = true }: { children?: ReactNode; links?: ReactNode; homeTo?: string; showLanguages?: boolean }) {
  const { t } = useTranslation()
  return (
    <header className="sitebar">
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <div className="sitebar__inner">
        <Brand to={homeTo} />
        {links}
        <div className="sitebar__end">
          {showLanguages ? <LanguageMenu /> : null}
          {children}
        </div>
      </div>
    </header>
  )
}
