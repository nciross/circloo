import { useTranslation } from 'react-i18next'
import { ArrowRight, Briefcase, Check, HeartHandshake, KeyRound, Users, type LucideIcon } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Band, BandHead, Item, Reveal } from './Band'

const ROLES: { id: 'families' | 'friends' | 'teams'; icon: LucideIcon }[] = [
  { id: 'families', icon: HeartHandshake },
  { id: 'friends', icon: Users },
  { id: 'teams', icon: Briefcase },
]

/**
 * The dark solutions band (#250): who a circle is for, as three role cards with a flat cerise disc rising from the
 * bottom edge; then the two banners, the company login (configuration, not code) and the free plan, which keeps
 * `#free` and `.free__facts` for the footer anchor and the tests.
 */
export function Solutions() {
  const { t } = useTranslation()
  const facts = t('landing.free.facts', { returnObjects: true }) as string[]
  const arrow = <ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />
  return (
    <Band id="for" tone="dark" className="who" labelledBy="who-title">
      <BandHead id="who-title" eyebrow={t('landing.who.eyebrow')} title={t('landing.who.title')} lead={t('landing.who.lead')} align="split" />
      <Reveal as="ul" className="roles">
        {ROLES.map(({ id, icon: Icon }) => (
          <Item key={id} as="li" className="role">
            <Icon className="role__icon" size={24} strokeWidth={2.25} aria-hidden="true" />
            <h3 className="role__title">{t(`landing.who.roles.${id}.title`)}</h3>
            <p className="role__body">{t(`landing.who.roles.${id}.body`)}</p>
            <span className="role__disc" aria-hidden="true" />
          </Item>
        ))}
      </Reveal>
      <Reveal className="banners">
        <Item as="article" className="banner banner--sso">
          <KeyRound className="banner__icon" size={28} strokeWidth={2.25} aria-hidden="true" />
          <div className="banner__copy">
            <h3 className="banner__title">{t('landing.sso.title')}</h3>
            <p className="banner__body">{t('landing.sso.body')}</p>
          </div>
          <a className="btn btn--default banner__cta" href="#faq">{t('landing.sso.cta')}</a>
        </Item>
        <Item as="article" id="free" className="banner banner--free card--dark">
          <div className="banner__copy">
            <h3 id="free-title" className="banner__title banner__title--xl">{t('landing.free.title')}</h3>
            <ul className="free__facts">
              {facts.map((f) => <li key={f}><Check size={18} strokeWidth={2.5} aria-hidden="true" /> {f}</li>)}
            </ul>
          </div>
          <ButtonLink to="/signin" variant="primary" size="lg" icon={arrow} className="banner__cta">{t('landing.free.cta')}</ButtonLink>
        </Item>
      </Reveal>
    </Band>
  )
}
