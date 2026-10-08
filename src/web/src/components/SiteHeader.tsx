import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Brand } from './Brand'
import { LanguageMenu } from './LanguageMenu'

/**
 * The public top bar: lockup and optional site links at the start, language and account actions at the end.
 * `tone="field"` sits the bar on the landing's cobalt field: white wordmark, a thin rule, the two-line tagline, and
 * white controls (the landing then renders its own order of links, language menu and pill as `children`).
 */
export function SiteHeader({
  children, links, homeTo = '/', showLanguages = true, tone,
}: {
  children?: ReactNode
  links?: ReactNode
  homeTo?: string
  showLanguages?: boolean
  tone?: 'field'
}) {
  const { t } = useTranslation()
  const field = tone === 'field'
  return (
    <header className={`sitebar${field ? ' sitebar--field on-field' : ''}`}>
      <a className="skip-link" href="#main">{t('common.skipToContent')}</a>
      <div className="sitebar__inner">
        <Brand to={homeTo} />
        {field ? (
          <>
            <span className="sitebar__rule" aria-hidden="true" />
            <p className="sitebar__tagline">
              <span>{t('landing.tagline1')}</span>
              <span>{t('landing.tagline2')}</span>
            </p>
          </>
        ) : null}
        {links}
        <div className="sitebar__end">
          {showLanguages ? <LanguageMenu /> : null}
          {children}
        </div>
      </div>
    </header>
  )
}
