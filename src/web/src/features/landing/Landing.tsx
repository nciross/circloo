import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarHeart, Check, Home, LayoutGrid, MessagesSquare, Search } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { ButtonLink } from '../../components/Button'
import { Wordmark } from '../../components/Brand'
import { Avatar } from '../../components/Avatar'
import { MoodIcon, type Mood } from '../../components/MoodIcon'
import { useDocumentTitle } from '../../app/locale'
import { IcebreakerCard } from './IcebreakerCard'
import { CircleStage } from './CircleStage'
import { Story } from './Story'
import { AudienceTabs, Compare, Drifters, Facts, Faq, FloatingCards, HeroForm, Jobs, LogoStrip, PlatformStrip, Principles } from './Sections'
import { INTEGRATIONS } from './integrations'
import { useScrollProgress, useScrollReveal } from './useMotion'
import '../../styles/landing.css'
import '../../styles/landing-motion.css'

interface CheckinItem { name: string; mood: string; need: string }
interface Step { title: string; body: string }

const CHECKIN_MOODS: Mood[] = [5, 3, 4, 2]

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
        <span className="preview__search"><Search size={14} /> {t('pirikoo.ask')}</span>
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
  useScrollReveal()
  const progress = useRef<HTMLDivElement>(null)
  useScrollProgress(progress)
  const steps = t('landing.how.steps', { returnObjects: true }) as Step[]
  const cols = t('landing2.footer.cols', { returnObjects: true }) as { title: string; links: { label: string; href: string }[] }[]

  return (
    <div className="site">
      <div ref={progress} className="scrollbar" aria-hidden="true"><span /></div>
      <SiteHeader
        links={
          <nav className="sitebar__links" aria-label={t('landing.nav.label')}>
            <a href="#story">{t('landing.nav.story')}</a>
            <a href="#audience">{t('landing2.nav.audience')}</a>
            <a href="#product">{t('landing2.nav.product')}</a>
            <a href="#pricing">{t('landing.nav.pricing')}</a>
            <a href="#faq">{t('landing2.nav.faq')}</a>
          </nav>
        }
      >
        <ButtonLink to="/signin" variant="subtle" size="sm" className="sitebar__signin">{t('common.signIn')}</ButtonLink>
        <ButtonLink to="/signin" size="sm">{t('landing.cta')}</ButtonLink>
      </SiteHeader>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <HeroForm />
            <h1 id="hero-title" className="hero__title">{t('landing.headline')}</h1>
            <p className="hero__lead">{t('landing.sub')}</p>
            <ul className="hero__facts">
              <li><Check size={16} aria-hidden="true" /> {t('landing.languagesLine')}</li>
              <li><Check size={16} aria-hidden="true" /> {t('landing.footer.private')}</li>
            </ul>
          </div>
          <div className="hero__art">
            <CircleStage />
            <FloatingCards />
          </div>
        </section>

        <LogoStrip />

        <Story />

        <AudienceTabs />

        <Jobs soon={t('common.soon')} />

        <PlatformStrip />

        <section id="how" className="band" aria-labelledby="how-title">
          <div className="band__inner">
            <h2 id="how-title" className="section-title">{t('landing.how.title')}</h2>
            <ol className="steps">
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

        <Facts>
          <ProductPreview />
        </Facts>

        <Principles />

        <Compare />

        <section id="integrations" className="band" aria-labelledby="plugs-title">
          <div className="band__inner">
            <div className="section-head">
              <h2 id="plugs-title" className="section-title">{t('landing.integrations.title')}</h2>
              <p>{t('landing.integrations.body')}</p>
            </div>
            <ul className="integrations">
              {INTEGRATIONS.map((p) => (
                <li key={p.id} className="integration">
                  <span className="integration__logos" aria-hidden="true">
                    {p.logos.map((l) => <img key={l} className="integration__logo" src={`/brands/${l}.svg`} alt="" width="40" height="40" />)}
                  </span>
                  <p className="integration__name" lang="en" dir="ltr">{p.name}</p>
                  <p className="integration__what">{t(`landing.integrations.items.${p.id}`)}</p>
                  {p.id === 'salesforce'
                    ? <span className="lozenge lozenge--neutral integration__soon">{t('landing.integrations.stamp')}</span>
                    : <span className="lozenge lozenge--success integration__soon">{t('landing.integrations.available')}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="pricing" className="band band--sunken" aria-labelledby="pricing-title">
          <div className="band__inner pricing">
            <div className="section-head pricing__head">
              <span className="pill-status">{t('landing2.pricing.status')}</span>
              <h2 id="pricing-title" className="section-title">{t('landing.pricing.title')}</h2>
              <p>{t('landing.pricing.body')}</p>
            </div>
            <article className="plan" aria-labelledby="plan-name">
              <div className="plan__top">
                <h3 id="plan-name" className="plan__name">{t('landing.pricing.plan')} <span className="plan__tag">{t('landing2.pricing.tag')}</span></h3>
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

        <Faq />

        <section className="cta" aria-labelledby="final-title">
          <Drifters />
          <div className="cta__inner">
            <p className="eyebrow eyebrow--inverse">{t('landing2.final.eyebrow')}</p>
            <h2 id="final-title" className="cta__title">{t('landing.final.title')}</h2>
            <p>{t('landing.final.body')}</p>
            <div className="cta__actions">
              <ButtonLink to="/signin" size="lg" icon={<ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />}>{t('landing.final.cta')}</ButtonLink>
              <a className="btn btn--lg btn--outline-inverse" href="#story"><span className="btn__label">{t('landing.ctaSecondary')}</span></a>
            </div>
            <p className="cta__note">{t('landing2.final.note')}</p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__about">
            <Wordmark />
            <p>{t('landing.footer.made')}</p>
          </div>
          <nav className="footer__cols" aria-label={t('landing.nav.label')}>
            {cols.map((c) => (
              <div key={c.title}>
                <h3 className="eyebrow">{c.title}</h3>
                <ul>{c.links.map((l) => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}</ul>
              </div>
            ))}
          </nav>
          <p className="footer__legal">{t('landing.footer.private')} {t('landing.footer.trademarks')}</p>
        </div>
      </footer>
    </div>
  )
}
