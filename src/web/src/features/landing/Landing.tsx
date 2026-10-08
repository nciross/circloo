import { useCallback, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion as m } from 'motion/react'
import { Link } from 'react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { LanguageMenu } from '../../components/LanguageMenu'
import { useDocumentTitle } from '../../app/locale'
import { spring } from '../../lib/motion'
import { SignInPanel } from '../auth/SignIn'
import { useLandingMotion } from './motion'
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
 * free plan, the questions and the charcoal footer. Log in in the bar swaps the board for the sign-in form, in place,
 * and the page becomes just that form until Back to the board. Scrolling plays a choreography (titles reveal, cards rise one by
 * one, the hero settles away; transform only); everything starts on its own for every visitor (the founder's call:
 * no pause control on the page).
 */
export function Landing() {
  const { t } = useTranslation()
  useDocumentTitle('landing.title')
  const lm = useLandingMotion()
  const playing = lm.on
  const [login, setLogin] = useState(false)
  const loginLink = useRef<HTMLAnchorElement>(null)

  // Log in opens the form where the board was (a plain click; a new tab or window still opens the page).
  const openLogin = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    setLogin(true)
    window.scrollTo({ top: 0, behavior: playing ? 'smooth' : 'auto' })
  }
  const closeLogin = () => {
    setLogin(false)
    loginLink.current?.focus()
  }
  const swap = playing ? spring.soft : { duration: 0 }
  // The form takes focus once, when it arrives.
  const focusForm = useCallback((el: HTMLDivElement | null) => {
    el?.querySelector<HTMLInputElement>('input:not([type=hidden])')?.focus()
  }, [])

  const faq = t('landing.faq.items', { returnObjects: true }) as {
    q: string
    a: string
  }[]

  return (
    <div className="site" data-motion={lm.on ? 'on' : 'off'}>
      <SiteHeader tone="site" showLanguages={false}>
        <LanguageMenu />
        <Link ref={loginLink} to="/signin" className="btn btn--sm btn--charcoal sitebar__login" aria-expanded={login} onClick={openLogin} viewTransition>
          {t('landing.nav.login')}
        </Link>
      </SiteHeader>

      <main id="main">
        <section id="start" className={`hero${login ? ' is-login' : ''}`} aria-labelledby="hero-title">
          <Blobs />
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">
              {t('landing.hero.scene')}
            </h1>
            <AnimatePresence mode="wait" initial={false}>
              {login ? (
                // The form springs in by moving only (axe reads it on arrival); the board tips back and sinks away.
                <m.div
                  key="login"
                  className="hero__login"
                  initial={{ y: 48, scale: 0.9, rotate: -2 }}
                  animate={{ y: 0, scale: 1, rotate: 0 }}
                  exit={{
                    y: 24,
                    scale: 0.94,
                    transition: { duration: playing ? 0.2 : 0 },
                  }}
                  transition={
                    playing
                      ? {
                          type: 'spring',
                          stiffness: 320,
                          damping: 22,
                          mass: 0.9,
                        }
                      : { duration: 0 }
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeLogin()
                  }}
                  ref={focusForm}
                >
                  <button type="button" className="hero__back" onClick={closeLogin}>
                    <ArrowLeft className="flip-rtl" size={16} strokeWidth={2.5} aria-hidden="true" /> {t('landing.login.back')}
                  </button>
                  <SignInPanel level="h2" />
                </m.div>
              ) : (
                <m.div
                  key="scene"
                  className="hero__stage"
                  initial={{ y: 20, scale: 0.97 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{
                    y: 36,
                    scale: 0.86,
                    rotateX: 18,
                    transition: {
                      duration: playing ? 0.3 : 0,
                      ease: [0.4, 0, 1, 1],
                    },
                  }}
                  transition={swap}
                >
                  <Scene />
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Signing in, the page is the form: the sections and the footer come back with Back to the board. */}
        {login ? null : (
          <>
            <Rounds />
            <How />
            <Player still={false} />
            <Jobs motion={playing} />
            <Plan />

            <section id="faq" className="strip faq" aria-labelledby="faq-title">
              <h2 id="faq-title" className="section-title">
                {t('landing.faq.title')}
              </h2>
              <div className="faq__list">
                {faq.map((f, i) => (
                  <details key={f.q} className="faqrow" name="faq" open={i === 0}>
                    <summary className="faqrow__sum">
                      <span>{f.q}</span>
                      <span className="faqrow__plus" aria-hidden="true">
                        <Plus size={20} strokeWidth={2.5} />
                      </span>
                    </summary>
                    <div className="faqrow__body">
                      <p>{f.a}</p>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {login ? null : <Footer />}
    </div>
  )
}
