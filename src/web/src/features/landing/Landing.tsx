import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarHeart, Check, Home, LayoutGrid, Lock, MessagesSquare, Search } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { ButtonLink } from '../../components/Button'
import { Brand, Wordmark } from '../../components/Brand'
import { Avatar } from '../../components/Avatar'
import { MoodIcon, type Mood } from '../../components/MoodIcon'
import { useDocumentTitle } from '../../app/locale'
import { IcebreakerCard } from './IcebreakerCard'
import { MoodDemo } from './MoodDemo'
import { CircleStage } from './CircleStage'
import '../../styles/landing.css'

interface CheckinItem { name: string; mood: string; need: string }
interface Step { title: string; body: string }

const CHECKIN_MOODS: Mood[] = [5, 3, 4, 2]
const BOARD = [
  { col: 'well', notes: [0], votes: [3] },
  { col: 'improve', notes: [1, 3], votes: [5, 2] },
  { col: 'actions', notes: [2, 4], votes: [4, 1] },
] as const

/** Real seed jokes, one per language, shown in their own language and direction. */
const FUN_CARDS = [
  { lang: 'fr', text: 'Que dit un escargot quand il croise une limace ? « Oh, un nudiste ! »' },
  { lang: 'es', text: '—¿Qué le dice una iguana a su hermana gemela? —¡Somos iguanitas!' },
  { lang: 'ar', text: 'قال الحاسوب لصاحبه: أنا متعب. فقال له: نَم قليلًا. فدخل في وضع السكون!' },
  { lang: 'en', text: "Why don't eggs tell jokes? They'd crack each other up." },
] as const

const INTEGRATIONS = [
  { id: 'teams', name: 'Microsoft Teams & 365', logos: ['teams', 'microsoft365'] },
  { id: 'salesforce', name: 'Salesforce', logos: ['salesforce'] },
  { id: 'jira', name: 'Jira', logos: ['jira'] },
  { id: 'confluence', name: 'Confluence', logos: ['confluence'] },
  { id: 'notion', name: 'Notion', logos: ['notion'] },
] as const

function Soon() {
  const { t } = useTranslation()
  return <span className="lozenge lozenge--neutral">{t('common.soon')}</span>
}

/** The product as it looks signed in: a live icebreaker and example check-ins inside the app frame. */
function ProductPreview() {
  const { t } = useTranslation()
  const checkins = t('landing.checkins.items', { returnObjects: true }) as CheckinItem[]
  return (
    <figure className="preview" aria-label={t('landing.preview')}>
      <div className="preview__bar" aria-hidden="true">
        <span className="preview__brand"><Wordmark interactive={false} /></span>
        <span className="preview__search"><Search size={14} /> {t('askbar.open')}</span>
        <Avatar name="Amina" size="sm" />
      </div>
      <div className="preview__body">
        <div className="preview__side" aria-hidden="true">
          <span className="preview__nav"><Home size={16} /> {t('common.nav.home')}</span>
          <span className="preview__nav is-active"><MessagesSquare size={16} /> {t('common.nav.icebreakers')}</span>
          <span className="preview__nav is-soon"><CalendarHeart size={16} /> {t('home.modules.checkins.title')}</span>
          <span className="preview__nav is-soon"><LayoutGrid size={16} /> {t('home.modules.boards.title')}</span>
        </div>
        <div className="preview__main">
          <IcebreakerCard />
          <div className="checkins">
            <p className="checkins__title">
              {t('landing.checkins.title')} <span className="lozenge lozenge--neutral">{t('common.example')}</span>
            </p>
            <ul className="checkins__list">
              {checkins.map((c, i) => (
                <li key={c.name} className="checkin">
                  <Avatar name={c.name} size="sm" />
                  <span className="checkin__name"><bdi>{c.name}</bdi></span>
                  <span className="checkin__mood"><MoodIcon mood={CHECKIN_MOODS[i] ?? 3} size={16} /> {c.mood}</span>
                  <span className="checkin__need">{c.need}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  )
}

export function Landing() {
  const { t } = useTranslation()
  useDocumentTitle('landing.title')
  const notes = t('landing.work.notes', { returnObjects: true }) as string[]
  const steps = t('landing.how.steps', { returnObjects: true }) as Step[]

  return (
    <div className="site">
      <SiteHeader>
        <ButtonLink to="/signin" variant="subtle" size="sm" className="sitebar__signin">{t('common.signIn')}</ButtonLink>
        <ButtonLink to="/signin" size="sm">{t('landing.cta')}</ButtonLink>
      </SiteHeader>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">{t('landing.headline')}</h1>
            <p className="hero__lead">{t('landing.sub')}</p>
            <div className="hero__actions">
              <ButtonLink to="/signin" size="lg" icon={<ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />}>
                {t('landing.cta')}
              </ButtonLink>
              <a className="hero__link" href="#how">{t('landing.ctaSecondary')}</a>
            </div>
            <ul className="hero__facts">
              <li><Check size={16} aria-hidden="true" /> {t('landing.languagesLine')}</li>
              <li><Lock size={16} aria-hidden="true" /> {t('landing.footer.private')}</li>
            </ul>
          </div>
          <CircleStage />
        </section>

        <section className="band band--sunken inside" aria-labelledby="inside-title">
          <div className="band__inner inside__inner">
            <div className="section-head">
              <h2 id="inside-title" className="section-title">{t('landing.inside.title')}</h2>
              <p>{t('landing.inside.body')}</p>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="product" className="band" aria-labelledby="features-title">
          <div className="band__inner">
            <h2 id="features-title" className="section-title">{t('landing.features')}</h2>

            <div className="feature reveal">
              <div className="feature__copy">
                <h3 className="feature__title">{t('landing.feel.title')} <Soon /></h3>
                <p>{t('landing.feel.body')}</p>
              </div>
              <div className="feature__show">
                <MoodDemo />
                <p className="feature__note">
                  <span className="lozenge lozenge--neutral">{t('common.example')}</span> {t('landing.feel.weather')}
                </p>
              </div>
            </div>

            <div className="feature feature--flip reveal">
              <div className="feature__copy">
                <h3 className="feature__title">{t('landing.work.title')} <Soon /></h3>
                <p>{t('landing.work.body')}</p>
              </div>
              <div className="feature__show">
                <div className="demo-board" role="group" aria-label={t('landing.work.title')}>
                  {BOARD.map((c) => (
                    <div key={c.col} className={`demo-board__col demo-board__col--${c.col}`}>
                      <h4 className="demo-board__head">{t(`landing.work.columns.${c.col}`)} <span className="demo-board__count">{c.notes.length}</span></h4>
                      {c.notes.map((n, i) => (
                        <div key={n} className="demo-note">
                          <p>{notes[n]}</p>
                          <span className="demo-note__votes" role="img" aria-label={t('landing.work.votes', { count: c.votes[i] })}>
                            {Array.from({ length: c.votes[i] ?? 0 }, (_, k) => <span key={k} className="demo-vote" aria-hidden="true" />)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="feature__note"><span className="lozenge lozenge--neutral">{t('common.example')}</span></p>
              </div>
            </div>

            <div className="feature reveal">
              <div className="feature__copy">
                <h3 className="feature__title">{t('landing.fun.title')} <span className="lozenge lozenge--success">{t('home.modules.icebreakers.tag')}</span></h3>
                <p>{t('landing.fun.body')}</p>
              </div>
              <div className="feature__show">
                <ul className="jokes">
                  {FUN_CARDS.map((c) => (
                    <li key={c.lang} className="joke" lang={c.lang} dir={c.lang === 'ar' ? 'rtl' : 'ltr'}>
                      <span className="joke__lang" aria-hidden="true">{t(`common.languageShort.${c.lang}`)}</span>
                      <p>{c.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="band" aria-labelledby="how-title">
          <div className="band__inner">
            <h2 id="how-title" className="section-title">{t('landing.how.title')}</h2>
            <ol className="steps reveal">
              {steps.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step__num" aria-hidden="true">{i + 1}</span>
                  <h3 className="step__title">{s.title} {i === 1 ? <Soon /> : null}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="band band--sunken" aria-labelledby="pricing-title">
          <div className="band__inner pricing">
            <div className="section-head pricing__head">
              <h2 id="pricing-title" className="section-title">{t('landing.pricing.title')}</h2>
              <p>{t('landing.pricing.body')}</p>
            </div>
            <article className="plan reveal" aria-labelledby="plan-name">
              <div className="plan__top">
                <h3 id="plan-name" className="plan__name">{t('landing.pricing.plan')}</h3>
                <p className="plan__price">
                  <span className="plan__amount">{t('landing.pricing.price')}</span>
                  <span className="plan__period">{t('landing.pricing.period')}</span>
                </p>
              </div>
              <ul className="plan__features">
                {(t('landing.pricing.features', { returnObjects: true }) as string[]).map((f) => (
                  <li key={f}><Check size={18} aria-hidden="true" /> {f}</li>
                ))}
              </ul>
              <ButtonLink to="/signin" size="lg" className="plan__cta" icon={<ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />}>
                {t('landing.pricing.cta')}
              </ButtonLink>
              <p className="plan__note">{t('landing.pricing.note')}</p>
            </article>
          </div>
        </section>

        <section id="integrations" className="band" aria-labelledby="plugs-title">
          <div className="band__inner">
            <div className="section-head">
              <h2 id="plugs-title" className="section-title">{t('landing.integrations.title')}</h2>
              <p>{t('landing.integrations.body')}</p>
            </div>
            <ul className="integrations reveal">
              {INTEGRATIONS.map((p) => (
                <li key={p.id} className="integration">
                  <span className="integration__logos" aria-hidden="true">
                    {p.logos.map((l) => <img key={l} className="integration__logo" src={`/brands/${l}.svg`} alt="" width="40" height="40" />)}
                  </span>
                  <p className="integration__name" lang="en" dir="ltr">{p.name}</p>
                  <p className="integration__what">{t(`landing.integrations.items.${p.id}`)}</p>
                  <span className="lozenge lozenge--neutral integration__soon">{t('landing.integrations.stamp')}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="cta" aria-labelledby="final-title">
          <div className="cta__inner">
            <h2 id="final-title" className="cta__title">{t('landing.final.title')}</h2>
            <p>{t('landing.final.body')}</p>
            <ButtonLink to="/signin" size="lg" icon={<ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />}>
              {t('landing.final.cta')}
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <Brand />
          <p>{t('landing.footer.private')}</p>
          <p>{t('landing.footer.made')}</p>
          <p className="footer__legal">{t('landing.footer.trademarks')}</p>
        </div>
      </footer>
    </div>
  )
}
