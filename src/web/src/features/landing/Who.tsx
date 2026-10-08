import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BookOpen, Briefcase, GraduationCap, House, PartyPopper, type LucideIcon } from 'lucide-react'

const CARDS: { id: string; icon: LucideIcon; tone: string }[] = [
  { id: 'families', icon: House, tone: 'mint' },
  { id: 'friends', icon: PartyPopper, tone: 'peach' },
  { id: 'teams', icon: Briefcase, tone: 'sky' },
  { id: 'classrooms', icon: GraduationCap, tone: 'butter' },
  { id: 'clubs', icon: BookOpen, tone: 'lavender' },
]

/** "Who it is for": five white tiles in a row, each a title, a corner arrow and a small icon on a pastel chip. */
export function Who() {
  const { t } = useTranslation()
  return (
    <section id="who" className="strip who" aria-labelledby="who-title">
      <div className="strip__head">
        <h2 id="who-title" className="section-title">{t('landing.who.title')}</h2>
      </div>
      <ul className="who__row">
        {CARDS.map((c, i) => {
          const Icon = c.icon
          return (
            <li key={c.id}>
              <a href="#how" className={`tile tile--${i + 1}`}>
                <span className="tile__title">{t(`landing.who.cards.${c.id}`)}</span>
                <span className="tile__foot">
                  <ArrowUpRight className="tile__arrow flip-rtl" size={18} strokeWidth={2.25} aria-hidden="true" />
                  <span className={`tile__icon tile__icon--${c.tone}`}><Icon size={20} strokeWidth={2.25} aria-hidden="true" /></span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
