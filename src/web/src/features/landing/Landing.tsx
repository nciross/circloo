import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Pause, Play, Plus } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { LanguageMenu } from '../../components/LanguageMenu'
import { useDocumentTitle } from '../../app/locale'
import { useLandingMotion } from './motion'
import { useStillMotion } from './useMotion'
import { Player } from './Player'
import { Jobs } from './Jobs'
import { Blobs } from './Blobs'
import { Scene } from './Scene'
import { Rounds } from './Rounds'
import { How } from './How'
import { Plan } from './Plan'
import { Footer } from './Footer'
import '../../styles/landing.css'

/**
 * The landing (issue #247, #250): a white canvas in the language of a people platform. The hero is a short headline
 * over a live board (friends' cursors, notes, votes, an icebreaker) flanked by character pictures that play along.
 * Then the rounds, how it works, the story, the three jobs, the
 * free plan, the questions and the charcoal footer. Scrolling plays a choreography (titles reveal, cards rise one by
 * one, the hero settles away; transform only); everything starts on its own for every visitor, and one Pause
 * control stills the whole page (WCAG 2.2.2).
 */
export function Landing() {
  const { t } = useTranslation()
  useDocumentTitle('landing.title')
  const motion = useStillMotion()
  const lm = useLandingMotion()
  const playing = lm.on && !motion.still

  const faq = t('landing.faq.items', { returnObjects: true }) as { q: string; a: string }[]

  return (
    <div className={`site${motion.still ? ' is-still' : ''}`} data-motion={lm.on ? 'on' : 'off'}>
      <SiteHeader tone="site" showLanguages={false}>
        <LanguageMenu />
        <Link to="/signin" className="btn btn--sm btn--charcoal sitebar__login" viewTransition>{t('landing.nav.login')}</Link>
      </SiteHeader>

      <main id="main">
        <section id="start" className="hero" aria-labelledby="hero-title">
          <Blobs />
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">{t('landing.hero.scene')}</h1>
            <Scene />
            <div className="hero__motion">
              {motion.offered ? (
                <button type="button" className="motion-toggle" aria-pressed={motion.still} onClick={motion.toggle}>
                  {motion.still ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />} {t('landing.motion.pause')}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <Rounds />
        <How />
        <Player still={motion.still} />
        <Jobs motion={playing} />
        <Plan />

        <section id="faq" className="strip faq" aria-labelledby="faq-title">
          <h2 id="faq-title" className="section-title">{t('landing.faq.title')}</h2>
          <div className="faq__list">
            {faq.map((f, i) => (
              <details key={f.q} className="faqrow" name="faq" open={i === 0}>
                <summary className="faqrow__sum"><span>{f.q}</span><span className="faqrow__plus" aria-hidden="true"><Plus size={20} strokeWidth={2.5} /></span></summary>
                <div className="faqrow__body"><p>{f.a}</p></div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}
