import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowUp } from 'lucide-react'
import { Wordmark } from '../../components/Brand'

interface FooterLink { label: string; href: string; soon?: boolean }

const PRODUCT: FooterLink[] = [
  { label: 'story', href: '#story' },
  { label: 'integrations', href: '#integrations' },
  { label: 'free', href: '#free' },
  { label: 'faq', href: '#faq' },
]
const FEATURES: FooterLink[] = [
  { label: 'icebreakers', href: '#fun' },
  { label: 'boards', href: '#work' },
  { label: 'presentations', href: '#work' },
  { label: 'checkin', href: '#feel', soon: true },
]
const ACCOUNT: FooterLink[] = [
  { label: 'signIn', href: '/signin' },
  { label: 'start', href: '/signin' },
]

function Column({ title, links, group }: { title: string; links: FooterLink[]; group: string }) {
  const { t } = useTranslation()
  return (
    <nav className="footer__col" aria-label={title}>
      <p className="footer__heading">{title}</p>
      <ul className="footer__list">
        {links.map((l) => {
          const label = t(`landing.footer.${group}.${l.label}`)
          return (
            <li key={`${l.label}-${l.href}`}>
              {l.href.startsWith('/') ? <Link to={l.href} viewTransition>{label}</Link> : <a href={l.href}>{label}</a>}
              {l.soon ? <span className="lozenge lozenge--neutral footer__soon">{t('common.soon')}</span> : null}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The dark footer: the brand with one line, four columns, and the bar with the year, the marks and the way up. */
export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__grid">
          <div className="footer__brand">
            <Wordmark interactive={false} />
            <p className="footer__about">{t('landing.footer.made')} {t('landing.footer.private')}</p>
          </div>
          <Column title={t('landing.footer.product.title')} links={PRODUCT} group="product" />
          <Column title={t('landing.footer.features.title')} links={FEATURES} group="features" />
          <div className="footer__col">
            <p className="footer__heading">{t('landing.footer.languages')}</p>
            <ul className="footer__list footer__list--plain">
              <li lang="en">English</li>
              <li lang="fr">français</li>
              <li lang="ar" dir="rtl">العربية</li>
              <li lang="es">español</li>
            </ul>
          </div>
          <Column title={t('landing.footer.account.title')} links={ACCOUNT} group="account" />
        </div>
        <div className="footer__bar">
          <p className="footer__copy">© 2026 circloo</p>
          <p className="footer__legal">{t('landing.footer.trademarks')}</p>
          <a className="footer__top" href="#main">{t('landing.footer.top')} <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" /></a>
        </div>
      </div>
    </footer>
  )
}
