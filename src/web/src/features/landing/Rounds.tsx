import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowUpRight, Clock } from 'lucide-react'
import { ACTIVITIES, CATEGORIES, type Category } from '../circles/catalog'
import { Motif } from './Doodles'

/** A typical length in minutes for every round in the catalog. */
const MINUTES: Record<string, number> = {
  'quick-question': 10, 'would-you-rather': 10, 'joke-round': 10, 'riddle-time': 15, 'two-truths': 15,
  'one-word': 5, 'mood-weather': 5, 'story-chain': 15,
  'start-stop-continue': 30, 'went-well': 20, kudos: 10, feedback: 10,
  'quick-poll': 5, 'agree-or-not': 10, brainstorm: 20, canvas: 20, poll: 5, qa: 20,
  presentation: 30,
}
/** "All" shows one or two of each kind, so the first view already says how wide the catalog is. */
const PICKS = ['quick-question', 'would-you-rather', 'mood-weather', 'story-chain', 'start-stop-continue', 'brainstorm', 'quick-poll', 'presentation']
const TONE: Record<Category, string> = { icebreakers: 'mint', energizers: 'butter', retro: 'lavender', decide: 'sky', present: 'peach' }

type Filter = 'all' | Category

/**
 * "Rounds for your circle" (#250): the real catalog. Category pills switch the cards (all, or one kind with every round
 * in it); each card is a pastel cover with the round's icon, a Free pill and its length, then the kind, the title,
 * one line and who it suits. Phones get a row that swipes and snaps card by card; wider screens a grid.
 */
export function Rounds() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const shown = filter === 'all'
    ? PICKS.map((id) => ACTIVITIES.find((a) => a.id === id)!).filter(Boolean)
    : ACTIVITIES.filter((a) => a.category === filter)
  const count = (c: Category) => ACTIVITIES.filter((a) => a.category === c).length

  return (
    <section id="rounds" className="strip rounds" aria-labelledby="rounds-title">
      <div className="strip__head">
        <div className="rounds__intro">
          <h2 id="rounds-title" className="section-title">
            {t('landing.rounds.title1')} <em className="accent">{t('landing.rounds.titleLink')}</em>
          </h2>
          <p className="section-lead">{t('landing.rounds.lead')}</p>
        </div>
        <Link to="/signin" className="strip__more" viewTransition>{t('landing.rounds.all')}</Link>
      </div>

      <div className="rounds__filters" role="group" aria-label={t('activities.category')}>
        {(['all', ...CATEGORIES] as Filter[]).map((f) => (
          <button key={f} type="button" className={`filter${f === 'all' ? '' : ` filter--${TONE[f]}`}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? t('activities.all') : t(`activities.categories.${f}`)}
            {f === 'all' ? null : <span className="filter__count">{count(f)}</span>}
          </button>
        ))}
      </div>

      {/* Keyed by the filter, so a switch deals the new cards in. */}
      <ul key={filter} className="rounds__grid">
        {shown.map((a, i) => {
          const Icon = a.icon
          return (
            <li key={a.id} className="rounds__item" style={{ '--i': i } as CSSProperties}>
              <Link to="/signin" className="round" viewTransition>
                <span className={`round__cover round__cover--${TONE[a.category]}`}>
                  <Icon className="round__icon" size={60} strokeWidth={1.75} aria-hidden="true" />
                  <Motif className="round__motif" />
                  <span className="round__free">{t('landing.rounds.free')}</span>
                  <span className="round__time"><Clock size={12} strokeWidth={2.5} aria-hidden="true" />{t('landing.rounds.minutes', { count: MINUTES[a.id] ?? 10 })}</span>
                </span>
                <span className="round__kind">{t(`activities.categories.${a.category}`)}</span>
                <span className="round__title">{t(`activities.${a.id}.title`)}</span>
                <span className="round__blurb">{t(`activities.${a.id}.body`)}</span>
                <span className="round__foot">
                  <span className="round__meta">{t('landing.rounds.everyone')} · {t('landing.rounds.by')}</span>
                  <ArrowUpRight className="round__go flip-rtl" size={18} strokeWidth={2.25} aria-hidden="true" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
