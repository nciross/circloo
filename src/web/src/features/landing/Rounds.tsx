import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { activityById, type Category } from '../circles/catalog'
import { Motif } from './Doodles'

/** Eight rounds from the real catalog, with a typical length in minutes. */
const PICKS: { id: string; minutes: number }[] = [
  { id: 'quick-question', minutes: 10 },
  { id: 'would-you-rather', minutes: 10 },
  { id: 'joke-round', minutes: 15 },
  { id: 'mood-weather', minutes: 5 },
  { id: 'start-stop-continue', minutes: 30 },
  { id: 'brainstorm', minutes: 20 },
  { id: 'quick-poll', minutes: 5 },
  { id: 'presentation', minutes: 30 },
]
const TONE: Record<Category, string> = { icebreakers: 'mint', energizers: 'butter', retro: 'lavender', decide: 'sky', present: 'peach' }

/** "Rounds for your circle": a grid of cards, each a pastel cover with the round's icon, a Free pill and a meta line. */
export function Rounds() {
  const { t } = useTranslation()
  return (
    <section id="rounds" className="strip rounds" aria-labelledby="rounds-title">
      <div className="strip__head">
        <h2 id="rounds-title" className="section-title">
          {t('landing.rounds.title1')} <em className="accent">{t('landing.rounds.titleLink')}</em>
        </h2>
        <Link to="/signin" className="strip__more" viewTransition>{t('landing.rounds.all')}</Link>
      </div>
      <ul className="rounds__grid">
        {PICKS.map(({ id, minutes }) => {
          const a = activityById(id)
          if (!a) return null
          const Icon = a.icon
          return (
            <li key={id}>
              <Link to="/signin" className="round" viewTransition>
                <span className={`round__cover round__cover--${TONE[a.category]}`}>
                  <Icon className="round__icon" size={60} strokeWidth={1.75} aria-hidden="true" />
                  <Motif className="round__motif" />
                  <span className="round__free">{t('landing.rounds.free')}</span>
                </span>
                <span className="round__title">{t(`activities.${id}.title`)}</span>
                <span className="round__blurb">{t(`activities.${id}.body`)}</span>
                <span className="round__meta">{t('landing.rounds.minutes', { count: minutes })} · {t('landing.rounds.everyone')}</span>
                <span className="round__meta">{t('landing.rounds.by')}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
