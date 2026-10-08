import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Brand } from './Brand'
import { LanguageMenu } from './LanguageMenu'

/**
 * The public top bar: lockup and optional site links at the start, language and account actions at the end.
 * `tone="field"` sits the bar on the landing's cobalt field: white wordmark, a thin rule, the two-line tagline, and
 * white controls. `tone="mauve"` is the sign-in pages' light mauve bar. `tone="site"` is the landing's sticky white
 * bar with a hairline under it: the landing renders its composite console as `links` and its own order of language
 * menu, link and pill as `children` (styles in landing.css).
 */
export function SiteHeader({
  children, links, homeTo = '/', showLanguages = true, tone,
}: {
  children?: ReactNode
  links?: ReactNode
  homeTo?: string
  showLanguages?: boolean
  tone?: 'field' | 'mauve' | 'site'
}) {
  const { t } = useTranslation()
  const field = tone === 'field'
  const mauve = tone === 'mauve'
  const site = tone === 'site'
  return (
    <header className={`sitebar${field ? ' sitebar--field on-field' : ''}${mauve ? ' sitebar--mauve' : ''}${site ? ' sitebar--site' : ''}`}>
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
