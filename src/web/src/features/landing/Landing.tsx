import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { Freezer } from '../../components/Freezer'
import { MagnetLink } from '../../components/Magnet'
import { MagnetWord } from '../../components/MagnetWord'
import { MoodIcon, type Mood } from '../../components/MoodIcon'
import { useDocumentTitle } from '../../app/locale'
import { IcebreakerCard } from './IcebreakerCard'
import '../../styles/landing.css'

interface CheckinItem { name: string; mood: string; need: string }
interface Step { title: string; body: string }

const CHECKIN_MOODS: Mood[] = [5, 3, 4, 2]
const BOARD = [
  { col: 'well', notes: [0], votes: [3], tone: 'yellow' },
  { col: 'improve', notes: [1, 3], votes: [5, 2], tone: 'pink' },
  { col: 'actions', notes: [2, 4], votes: [4, 1], tone: 'blue' },
] as const

/** Real seed jokes, one per language, shown in their own language and direction. */
const FUN_CARDS = [
  { lang: 'fr', text: 'Que dit un escargot quand il croise une limace ? « Oh, un nudiste ! »' },
  { lang: 'es', text: '—¿Qué le dice una iguana a su hermana gemela? —¡Somos iguanitas!' },
  { lang: 'ar', text: 'قال الحاسوب لصاحبه: أنا متعب. فقال له: نَم قليلًا. فدخل في وضع السكون!' },
  { lang: 'en', text: "Why don't eggs tell jokes? They'd crack each other up." },
] as const

const INTEGRATIONS = [
  { id: 'teams', name: 'Microsoft Teams · Office 365' },
  { id: 'salesforce', name: 'Salesforce' },
  { id: 'jira', name: 'Jira' },
  { id: 'confluence', name: 'Confluence' },
  { id: 'notion', name: 'Notion' },
] as const

export function Landing() {
  const { t } = useTranslation()
  useDocumentTitle('landing.title')
  const checkins = t('landing.checkins.items', { returnObjects: true }) as CheckinItem[]
  const notes = t('landing.work.notes', { returnObjects: true }) as string[]
  const steps = t('landing.how.steps', { returnObjects: true }) as Step[]

  return (
    <div className="fridge">
      <Freezer>
        <MagnetLink to="/signin" color="paper" size="sm">{t('common.signIn')}</MagnetLink>
      </Freezer>

      <main id="main" className="door">
        <span className="door__handle" aria-hidden="true" />

        <section className="hero door__panel" aria-labelledby="hero-title">
          <div className="hero__copy">
            <MagnetWord label={t('common.brand')} />
            <p className="hero__hint">{t('landing.wordmarkHint')}</p>
            <div className="paper-strip">
              <span className="pin-magnet pin-magnet--tomato" aria-hidden="true" />
              <h1 id="hero-title" className="paper-strip__title">{t('landing.headline')}</h1>
            </div>
            <p className="hero__sub">{t('landing.sub')}</p>
            <p className="hero__langs">{t('landing.languagesLine')}</p>
            <div className="hero__actions">
              <MagnetLink to="/signin" size="lg" icon={<ArrowRight className="flip-rtl" size={22} strokeWidth={2.5} />}>
                {t('landing.cta')}
              </MagnetLink>
              <a className="text-link" href="#feel">
                {t('landing.ctaSecondary')} <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="hero__stuck">
            <IcebreakerCard />
            <figure className="checkin-strip">
              <figcaption className="checkin-strip__title">
                {t('landing.checkins.title')} <span className="tag">{t('common.example')}</span>
              </figcaption>
              <ul className="checkin-strip__list">
                {checkins.map((c, i) => (
                  <li key={c.name} className="checkin">
                    <MoodIcon mood={CHECKIN_MOODS[i] ?? 3} size={22} />
                    <span className="checkin__name"><bdi>{c.name}</bdi></span>
                    <span className="checkin__mood">{c.mood}</span>
                    <span className="checkin__need">{c.need}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </section>

        <section id="feel" className="feel door__panel" aria-labelledby="feel-title">
          <div className="section-note section-note--tomato">
            <span className="pin-magnet pin-magnet--tomato" aria-hidden="true" />
            <h2 id="feel-title" className="section-title">{t('landing.feel.title')}</h2>
            <p>{t('landing.feel.body')}</p>
            <p><span className="tag tag--soon">{t('common.soon')}</span></p>
          </div>
          <ul className="mood-row" aria-label={t('landing.feel.title')}>
            {([1, 2, 3, 4, 5] as Mood[]).map((m) => (
              <li key={m} className={`mood-magnet mood-magnet--${m}`}>
                <MoodIcon mood={m} size={34} />
                <span>{t(`landing.feel.moods.${m}`)}</span>
              </li>
            ))}
          </ul>
          <p className="weather-note">
            <span className="tag">{t('common.example')}</span> {t('landing.feel.weather')}
          </p>
        </section>

        <section className="work door__panel" aria-labelledby="work-title">
          <div className="section-note section-note--cobalt">
            <span className="pin-magnet pin-magnet--cobalt" aria-hidden="true" />
            <h2 id="work-title" className="section-title">{t('landing.work.title')}</h2>
            <p>{t('landing.work.body')}</p>
            <p><span className="tag tag--soon">{t('common.soon')}</span></p>
          </div>
          <div className="mini-board" role="group" aria-label={t('landing.work.title')}>
            <span className="tag mini-board__example">{t('common.example')}</span>
            {BOARD.map((c) => (
              <div key={c.col} className="mini-board__col">
                <h3 className="mini-board__head">{t(`landing.work.columns.${c.col}`)}</h3>
                {c.notes.map((n, i) => (
                  <div key={n} className={`sticky sticky--${c.tone}`}>
                    <p>{notes[n]}</p>
                    <span className="sticky__votes" role="img" aria-label={t('landing.work.votes', { count: c.votes[i] })}>
                      {Array.from({ length: c.votes[i] ?? 0 }, (_, k) => <span key={k} className="vote-dot" aria-hidden="true" />)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="fun door__panel" aria-labelledby="fun-title">
          <div className="section-note section-note--sunflower">
            <span className="pin-magnet pin-magnet--sunflower" aria-hidden="true" />
            <h2 id="fun-title" className="section-title">{t('landing.fun.title')}</h2>
            <p>{t('landing.fun.body')}</p>
            <p><span className="tag tag--soon">{t('common.soon')}</span></p>
          </div>
          <ul className="joke-fan">
            {FUN_CARDS.map((c) => (
              <li key={c.lang} className={`joke-card joke-card--${c.lang}`} lang={c.lang} dir={c.lang === 'ar' ? 'rtl' : 'ltr'}>
                <span className="joke-card__lang" aria-hidden="true">{t(`common.languageShort.${c.lang}`)}</span>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="plugs door__panel" aria-labelledby="plugs-title">
          <div className="section-note section-note--ink">
            <span className="pin-magnet pin-magnet--ink" aria-hidden="true" />
            <h2 id="plugs-title" className="section-title">{t('landing.integrations.title')}</h2>
            <p>{t('landing.integrations.body')}</p>
          </div>
          <ul className="postcards">
            {INTEGRATIONS.map((p) => (
              <li key={p.id} className={`postcard postcard--${p.id}`}>
                <p className="postcard__what">{t(`landing.integrations.items.${p.id}`)}</p>
                <div className="postcard__address">
                  <span className="postcard__stamp" aria-hidden="true" />
                  <span className="postcard__postmark">{t('landing.integrations.stamp')}</span>
                  <p className="postcard__name" lang="en" dir="ltr">{p.name}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="how door__panel" aria-labelledby="how-title">
          <div className="chore-list">
            <span className="pin-magnet pin-magnet--cobalt" aria-hidden="true" />
            <h2 id="how-title" className="section-title">{t('landing.how.title')}</h2>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className="step">
                  <span className={`step__num letter letter--${(['tomato', 'cobalt', 'sunflower'] as const)[i] ?? 'ink'}`} aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3 className="step__title">
                      {s.title} {i === 1 ? <span className="tag tag--soon">{t('common.soon')}</span> : null}
                    </h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="final door__panel" aria-labelledby="final-title">
          <div className="final__note">
            <span className="pin-magnet pin-magnet--sunflower" aria-hidden="true" />
            <h2 id="final-title" className="final__title">{t('landing.final.title')}</h2>
            <p>{t('landing.final.body')}</p>
            <MagnetLink to="/signin" size="lg" icon={<ArrowRight className="flip-rtl" size={22} strokeWidth={2.5} />}>
              {t('landing.final.cta')}
            </MagnetLink>
          </div>
        </section>
      </main>

      <footer className="kick-plate">
        <p className="kick-plate__brand">circloo</p>
        <p>{t('landing.footer.private')}</p>
        <p>{t('landing.footer.made')}</p>
      </footer>
    </div>
  )
}
