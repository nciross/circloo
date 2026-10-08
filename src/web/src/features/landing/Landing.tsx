import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Pause, Play, Plus, Undo2 } from 'lucide-react'
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
import { Samples } from './Samples'
import { Who } from './Who'
import { Popular } from './Popular'
import { How } from './How'
import { Plan } from './Plan'
import { Footer } from './Footer'
import '../../styles/landing.css'

/**
 * The landing (issue #247, #250): a white canvas in the language of a people platform. The hero is a short headline
 * over a live board (friends' cursors, notes, votes, an icebreaker) flanked by character pictures that play along.
 * Then the rounds, the four languages, who it is for, popular circles, how it works, the story, the three jobs, the
 * free plan, the questions and the charcoal footer. Sections rise into place as they scroll in (transform only);
 * every movement has a still path and a pause.
 */
export function Landing() {
  const { t } = useTranslation()
  useDocumentTitle('landing.title')
  const motion = useStillMotion()
  const lm = useLandingMotion()
  const playing = lm.on && !motion.still
  const [announce, setAnnounce] = useState('')

  const toggleOptIn = () => {
    setAnnounce(t(lm.optedIn ? 'landing.motion.following' : 'landing.motion.playing'))
    lm.toggleOptIn()
  }

  const faq = t('landing.faq.items', { returnObjects: true }) as { q: string; a: string }[]

  return (
    <div className={`site${motion.still ? ' is-still' : ''}`} data-motion={lm.on ? 'on' : 'off'}>
      <SiteHeader tone="site" showLanguages={false}>
        <LanguageMenu />
        <Link to="/signin" className="sitebar__signin" viewTransition>{t('landing.nav.login')}</Link>
        <Link to="/signin" className="btn btn--sm btn--charcoal" viewTransition>{t('landing.cta')}</Link>
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
              {lm.reduced ? (
                // A changing label says what a press does; aria-pressed on top would read as "Respect my system setting, pressed".
                <button type="button" className="motion-toggle motion-optin" onClick={toggleOptIn}>
                  {lm.optedIn ? <Undo2 className="flip-rtl" size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {t(lm.optedIn ? 'landing.motion.respect' : 'landing.motion.play')}
                </button>
              ) : null}
              <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
            </div>
          </div>
        </section>

        <Rounds />
        <Samples />
        <Who />
        <Popular />
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
