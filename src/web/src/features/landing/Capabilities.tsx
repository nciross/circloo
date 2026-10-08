import { useTranslation } from 'react-i18next'
import { Band, BandHead, Item, Reveal } from './Band'

/** Small abstract pictures drawn in code: chips, dots and connectors in the one colour, nothing photographic. */
const ART = {
  private: (
    <div className="art art--private" aria-hidden="true">
      <span className="art__chip art__chip--lock" />
      <span className="art__dots"><i /><i /><i /><i /><i /></span>
      <span className="art__chip art__chip--wide" />
    </div>
  ),
  languages: (
    <div className="art art--languages" aria-hidden="true">
      <span className="art__line art__line--ltr" />
      <span className="art__line art__line--ltr art__line--short" />
      <span className="art__line art__line--rtl" />
      <span className="art__line art__line--rtl art__line--short" />
    </div>
  ),
  kids: (
    <div className="art art--kids" aria-hidden="true">
      <span className="art__card" />
      <span className="art__card art__card--front" />
      <span className="art__tag" />
    </div>
  ),
  week: (
    <div className="art art--week" aria-hidden="true">
      <span className="art__node art__node--a" />
      <span className="art__wire" />
      <span className="art__node art__node--b" />
      <span className="art__node art__node--c" />
      <span className="art__node art__node--d" />
    </div>
  ),
} as const

const ITEMS = ['private', 'languages', 'kids', 'week'] as const

/** The 2×2 capability grid: four promises, each with its own small drawing. */
export function Capabilities() {
  const { t } = useTranslation()
  return (
    <Band id="promises" className="caps" labelledBy="caps-title">
      <BandHead id="caps-title" eyebrow={t('landing.caps.eyebrow')} title={t('landing.caps.title')} lead={t('landing.caps.lead')} />
      <Reveal as="ul" className="caps__grid">
        {ITEMS.map((id) => (
          <Item key={id} as="li" className="panel cap">
            {ART[id]}
            <h3 className="cap__title">{t(`landing.caps.items.${id}.title`)}</h3>
            <p className="cap__body">{t(`landing.caps.items.${id}.body`)}</p>
          </Item>
        ))}
      </Reveal>
    </Band>
  )
}
