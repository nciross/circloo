import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Heart } from 'lucide-react'
import { Wordmark } from '../../components/Brand'

interface FooterLink { label: string; href: string }

const ACCOUNT: FooterLink[] = [
  { label: 'login', href: '/signin' },
  { label: 'start', href: '/signin' },
]
const DISCOVER: FooterLink[] = [
  { label: 'rounds', href: '#rounds' },
  { label: 'how', href: '#how' },
  { label: 'free', href: '#free' },
  { label: 'faq', href: '#faq' },
]

function Column({ group, links }: { group: string; links: FooterLink[] }) {
  const { t } = useTranslation()
  const title = t(`landing.footer.${group}.title`)
  return (
    <nav className="footer__col" aria-label={title}>
      <p className="footer__heading">{title}</p>
      <ul className="footer__list">
        {links.map((l) => {
          const label = t(`landing.footer.${group}.${l.label}`)
          return (
            <li key={`${l.label}-${l.href}`}>
              {l.href.startsWith('/') ? <Link to={l.href} viewTransition>{label}</Link> : <a href={l.href}>{label}</a>}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The footer: one charcoal panel inset by the page gutter, the brand line, three columns and the legal row. */
export function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="footer">
      <div className="footer__panel">
        <div className="footer__top">
          <p className="footer__brand">
            <Wordmark interactive={false} />
            <span className="footer__tag">{t('landing.footer.tag')}</span>
          </p>
          <p className="footer__create">
            {t('landing.footer.create')}{' '}
            <Link to="/signin" className="footer__start" viewTransition>
              {t('landing.footer.start')} <ArrowRight className="flip-rtl" size={18} strokeWidth={2.5} aria-hidden="true" />
            </Link>
          </p>
        </div>
        <div className="footer__cols">
          <Column group="account" links={ACCOUNT} />
          <Column group="discover" links={DISCOVER} />
          <div className="footer__col">
            <p className="footer__heading">{t('landing.footer.languages')}</p>
            <ul className="footer__list">
              <li lang="en">English</li>
              <li lang="fr">français</li>
              <li lang="ar" dir="rtl">العربية</li>
              <li lang="es">español</li>
            </ul>
          </div>
        </div>
        <div className="footer__bar">
          <p className="footer__copy">© 2026 circloo</p>
          <p className="footer__legal">{t('landing.footer.trademarks')}</p>
          <p className="footer__made">
            {t('landing.footer.made1')} <Heart className="footer__heart" size={14} strokeWidth={2.5} fill="currentColor" aria-hidden="true" /> {t('landing.footer.made2')}
          </p>
        </div>
      </div>
    </footer>
  )
}
