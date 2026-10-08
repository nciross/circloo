import { useTranslation } from 'react-i18next'
import { INTEGRATIONS } from './integrations'
import { Band, Item, Reveal } from './Band'

/** The integrations strip: a centred row of grey marks that take their colour on hover, each with its state. */
export function Plugs() {
  const { t } = useTranslation()
  return (
    <Band id="integrations" sunken className="plugs" labelledBy="plugs-title">
      <div className="plugs__head">
        <p className="eyebrow eyebrow--center">{t('landing.integrations.eyebrow')}</p>
        <h2 id="plugs-title" className="band__title band__title--sm">{t('landing.integrations.title')}</h2>
        <p className="band__lead band__lead--center">{t('landing.integrations.body')}</p>
      </div>
      <Reveal as="ul" className="plugs__list" stagger={0.04}>
        {INTEGRATIONS.map((p) => (
          <Item key={p.id} as="li" className="plug">
            <span className="plug__logos" aria-hidden="true">
              {p.logos.map((l) => <img key={l} className="plug__logo" src={`/brands/${l}.svg`} alt="" width="40" height="40" loading="lazy" />)}
            </span>
            <span className="plug__name" lang="en" dir="ltr">{p.name}</span>
            <span className="plug__what">{t(`landing.integrations.items.${p.id}`)}</span>
            {p.id === 'salesforce'
              ? <span className="lozenge lozenge--neutral">{t('landing.integrations.stamp')}</span>
              : <span className="lozenge lozenge--success">{t('landing.integrations.available')}</span>}
          </Item>
        ))}
      </Reveal>
    </Band>
  )
}
