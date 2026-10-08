import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'
import { Burst } from './Doodles'

/**
 * The plan (#250): one plan, and it is free for now. No invented tiers, no prices to come: one card with what is
 * included, the promise about any future paid plan, and the one button. A handwritten aside says it plainly.
 */
export function Plan() {
  const { t } = useTranslation()
  const items = t('landing.plan.items', { returnObjects: true }) as string[]
  return (
    <section id="free" className="strip plan" aria-labelledby="plan-title">
      <div className="plan__head">
        <h2 id="plan-title" className="section-title section-title--center">{t('landing.plan.title')}</h2>
        <p className="section-lead plan__lead">{t('landing.plan.lead')}</p>
      </div>
      <div className="plan__stage">
        <article className="plan__card" aria-labelledby="plan-name">
          <div className="plan__top">
            <h3 id="plan-name" className="plan__name">{t('landing.plan.name')}</h3>
            <span className="plan__badge">{t('landing.plan.badge')}</span>
          </div>
          <p className="plan__price">
            <span className="plan__amount">{t('landing.plan.price')}</span>
            <span className="plan__per">{t('landing.plan.per')}</span>
          </p>
          <ul className="plan__list">
            {items.map((item) => (
              <li key={item}>
                <span className="plan__check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link to="/signin" className="btn btn--lg btn--charcoal plan__cta" viewTransition>
            {t('landing.plan.cta')} <ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} aria-hidden="true" />
          </Link>
          <p className="plan__later">{t('landing.plan.later')}</p>
        </article>
        <p className="hand hand--pink plan__note">
          <Burst className="plan__star" tone="peach" />
          <span>{t('landing.plan.note')}</span>
        </p>
      </div>
    </section>
  )
}
