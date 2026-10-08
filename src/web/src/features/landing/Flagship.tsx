import { useTranslation } from 'react-i18next'
import { ArrowRight, Link2, Lock } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Bird } from '../pirikoo/Bird'
import { Band, Item, Reveal } from './Band'

/** The four languages, set large: the first proof under the fold. */
export function Tongues() {
  const { t } = useTranslation()
  return (
    <Band className="tongues" label={t('landing.tongues.label')}>
      <p className="eyebrow eyebrow--center">{t('landing.tongues.eyebrow')}</p>
      <ul className="tongues__list">
        <li lang="en">English</li>
        <li lang="fr">français</li>
        <li lang="ar" dir="rtl">العربية</li>
        <li lang="es">español</li>
      </ul>
      <p className="tongues__line">{t('landing.tongues.line')}</p>
    </Band>
  )
}

/** Four numbers, all true today: the cast, the languages, the kinds of rounds, the passwords. */
const STATS = [
  { id: 'characters', n: '48' },
  { id: 'languages', n: '4' },
  { id: 'rounds', n: '6' },
  { id: 'passwords', n: '0' },
] as const

/**
 * The flagship split (#250): Pirikoo introduced, the two calls, and a stats card with the facts set at display size.
 * No invented metrics: every number comes from the product as it is.
 */
export function Flagship() {
  const { t } = useTranslation()
  const arrow = <ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />
  return (
    <Band id="pirikoo" className="flag" labelledBy="flag-title">
      <Reveal className="flag__grid">
        <Item className="flag__copy">
          <span className="lozenge lozenge--ai flag__badge">
            <Bird className="flag__bird" mood="happy" />
            {t('landing.flag.badge')}
          </span>
          <h2 id="flag-title" className="band__title band__title--xl">
            {t('landing.flag.title1')} <span className="flag__name">Pirikoo</span> {t('landing.flag.title2')}
          </h2>
          <p className="band__lead">{t('landing.flag.body')}</p>
          <div className="flag__actions">
            <ButtonLink to="/signin" variant="primary" icon={arrow}>{t('landing.cta')}</ButtonLink>
            <a className="btn btn--default" href="#story">{t('landing.flag.how')}</a>
          </div>
        </Item>
        <Item className="panel flag__stats" as="div">
          <dl className="flag__numbers">
            {STATS.map((s) => (
              <div key={s.id} className="flag__stat">
                <dt className="flag__what">{t(`landing.flag.stats.${s.id}`)}</dt>
                <dd className="flag__n">{s.n}</dd>
              </div>
            ))}
          </dl>
          <ul className="flag__more">
            <li><Link2 size={18} strokeWidth={2.25} aria-hidden="true" /> {t('landing.flag.join')}</li>
            <li><Lock size={18} strokeWidth={2.25} aria-hidden="true" /> {t('landing.flag.private')}</li>
          </ul>
        </Item>
      </Reveal>
    </Band>
  )
}
