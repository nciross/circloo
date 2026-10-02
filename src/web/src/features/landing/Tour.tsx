import { useTranslation } from 'react-i18next'
import { TourVideo } from '../../components/TourVideo'

/** The landing's tour band: the 20-second video plays muted while it is on screen. */
export function Tour() {
  const { t } = useTranslation()
  return (
    <section className="band tour" aria-labelledby="tour-title">
      <div className="band__inner tour__inner">
        <div className="section-head tour__head">
          <h2 id="tour-title" className="section-title">{t('landing.tour.title')}</h2>
          <p>{t('landing.tour.lead')}</p>
        </div>
        <TourVideo whileVisible className="tour__frame" />
      </div>
    </section>
  )
}
