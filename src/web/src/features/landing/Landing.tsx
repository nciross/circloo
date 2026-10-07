import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Check, Pause, Play, Plus, Undo2 } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { ButtonLink } from '../../components/Button'
import { Wordmark } from '../../components/Brand'
import { useDocumentTitle } from '../../app/locale'
import { useUiStore } from '../../stores/ui'
import type { BirdMood } from '../pirikoo/Bird'
import { INTEGRATIONS } from './integrations'
import { useLandingMotion } from './motion'
import { useStillMotion } from './useMotion'
import { useCompose, type Words } from './useCompose'
import type { Composition } from './compose'
import { Say } from './Say'
import { Made } from './Made'
import { Player } from './Player'
import { Jobs } from './Jobs'
import '../../styles/landing.css'

const AUTO_DEMO_MS = 1200

/**
 * The landing (issue #247): the prompt is the product. One line composes a circle in front of the visitor, then the
 * story clips, the three jobs shown by the real thing, the four languages, the integrations, the free plan, the FAQ
 * and one more line. Mobile first; every animation has a still path and a pause.
 */
export function Landing() {
  const { t, i18n } = useTranslation()
  useDocumentTitle('landing.title')
  const locale = useUiStore((s) => s.locale)
  const motion = useStillMotion()
  const lm = useLandingMotion()
  const playing = lm.on && !motion.still
  const [announce, setAnnounce] = useState('')
  const [text, setText] = useState('')
  const touched = useRef(false)

  const words = useCallback(
    (c: Composition): Words => {
      const titles = c.activities.map((id) => t(`activities.${id}.title`))
      const rest = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(titles.slice(1))
      return {
        name: t(`landing.made.names.${c.name}`),
        line: titles.length > 1 ? t('landing.made.line', { first: titles[0], rest }) : t('landing.made.lineOne', { first: titles[0] }),
      }
    },
    [t, i18n.language],
  )
  const { run, start } = useCompose(locale, playing, words)
  const examples = useMemo(() => t('landing.say.list', { returnObjects: true }) as string[], [t])

  const build = (line: string) => {
    touched.current = true
    if (!line.trim()) return
    start(line)
    // On a phone the composition sits under the console: bring it into view so the line is seen becoming a circle.
    const made = document.getElementById('made')
    if (made && !window.matchMedia('(min-width: 60rem)').matches) made.scrollIntoView({ behavior: playing ? 'smooth' : 'auto', block: 'start' })
  }

  // Nobody touched the console: the first example composes itself, so the page moves on arrival. Pause stops it.
  // The field stays as the visitor left it (the placeholder already shows that line): nobody finds words they did not type.
  useEffect(() => {
    if (!playing || run || touched.current) return
    const id = window.setTimeout(() => {
      if (touched.current) return
      start(examples[0] ?? '')
    }, AUTO_DEMO_MS)
    return () => window.clearTimeout(id)
  }, [playing, run, start, examples])

  // The bird thinks, talks, hops once when the circle is ready, then rests.
  const mood: BirdMood | undefined = !run || run.phase === 'settled' ? undefined : run.phase === 'done' ? 'happy' : run.phase === 'speaking' ? 'speaking' : 'thinking'

  const toggleOptIn = () => {
    setAnnounce(t(lm.optedIn ? 'landing.motion.following' : 'landing.motion.playing'))
    lm.toggleOptIn()
  }

  const facts = t('landing.hero.facts', { returnObjects: true }) as string[]
  const free = t('landing.free.facts', { returnObjects: true }) as string[]
  const faq = t('landing.faq.items', { returnObjects: true }) as { q: string; a: string }[]
  const links = t('landing.footer.links', { returnObjects: true }) as { label: string; href: string }[]
  const arrow = <ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />

  return (
    <div className={`site${motion.still ? ' is-still' : ''}`} data-motion={lm.on ? 'on' : 'off'}>
      <SiteHeader
        links={
          <nav className="sitebar__links" aria-label={t('landing.nav.label')}>
            <a href="#story">{t('landing.nav.story')}</a>
            <a href="#jobs">{t('landing.nav.jobs')}</a>
            <a href="#free">{t('landing.nav.free')}</a>
            <a href="#faq">{t('landing.nav.faq')}</a>
          </nav>
        }
      >
        <ButtonLink to="/signin" variant="subtle" size="sm" className="sitebar__signin">{t('common.signIn')}</ButtonLink>
        <ButtonLink to="/signin" size="sm">{t('landing.cta')}</ButtonLink>
      </SiteHeader>

      <main id="main">
        <section id="start" className="console" aria-labelledby="hero-title">
          <div className="console__inner">
            <div className="console__copy">
              <h1 id="hero-title" className="console__title">
                {t('landing.hero.title')} <span className="console__title2">{t('landing.hero.title2')}</span>
              </h1>
              <Say
                text={text}
                onText={setText}
                onBuild={build}
                onTouch={() => { touched.current = true }}
                mood={mood}
                idle={playing ? 'idle' : undefined}
                examples={examples}
              />
            </div>
            <div id="made" className="console__made">
              <Made run={run} motion={playing} />
            </div>
            <div className="console__foot">
              <ul className="console__facts">
                {facts.map((f) => <li key={f}><Check size={16} aria-hidden="true" /> <bdi>{f}</bdi></li>)}
              </ul>
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
          </div>
        </section>

        <Player still={motion.still} />

        <Jobs motion={playing} />

        <section className="tongues" aria-label={t('landing.tongues.label')}>
          <ul className="tongues__list">
            <li lang="en">English</li>
            <li lang="fr">français</li>
            <li lang="ar" dir="rtl">العربية</li>
            <li lang="es">español</li>
          </ul>
          <p className="tongues__line">{t('landing.tongues.line')}</p>
        </section>

        <section id="integrations" className="plugs" aria-labelledby="plugs-title">
          <div className="plugs__inner">
            <div className="section-head">
              <h2 id="plugs-title" className="section-title">{t('landing.integrations.title')}</h2>
              <p className="section-lead">{t('landing.integrations.body')}</p>
            </div>
            <ul className="plugs__list">
              {INTEGRATIONS.map((p) => (
                <li key={p.id} className="plug">
                  <span className="plug__logos" aria-hidden="true">
                    {p.logos.map((l) => <img key={l} className="plug__logo" src={`/brands/${l}.svg`} alt="" width="36" height="36" />)}
                  </span>
                  <span className="plug__name" lang="en" dir="ltr">{p.name}</span>
                  <span className="plug__what">{t(`landing.integrations.items.${p.id}`)}</span>
                  {p.id === 'salesforce'
                    ? <span className="lozenge lozenge--neutral plug__status">{t('landing.integrations.stamp')}</span>
                    : <span className="lozenge lozenge--success plug__status">{t('landing.integrations.available')}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="free" className="free" aria-labelledby="free-title">
          <div className="free__inner">
            <h2 id="free-title" className="section-title">{t('landing.free.title')}</h2>
            <ul className="free__facts">
              {free.map((f) => <li key={f}><Check size={18} aria-hidden="true" /> {f}</li>)}
            </ul>
            <ButtonLink to="/signin" size="lg" icon={arrow}>{t('landing.free.cta')}</ButtonLink>
          </div>
        </section>

        <section id="faq" className="faq" aria-labelledby="faq-title">
          <div className="faq__inner">
            <h2 id="faq-title" className="section-title">{t('landing.faq.title')}</h2>
            <div className="faq__list">
              {faq.map((f, i) => (
                <details key={f.q} className="faqrow" name="faq" open={i === 0}>
                  <summary className="faqrow__sum"><span>{f.q}</span><span className="faqrow__plus" aria-hidden="true"><Plus size={18} /></span></summary>
                  <div className="faqrow__body"><p>{f.a}</p></div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="again" aria-labelledby="again-title">
          <div className="again__inner">
            <h2 id="again-title" className="again__title">{t('landing.final.title')}</h2>
            <p>{t('landing.final.body')}</p>
            <Say
              compact
              text={text}
              onText={setText}
              onBuild={(line) => {
                build(line)
                document.getElementById('made')?.scrollIntoView({ behavior: playing ? 'smooth' : 'auto', block: 'center' })
              }}
              onTouch={() => { touched.current = true }}
              mood={mood}
            />
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer__inner">
          <div className="footer__row">
            <Wordmark />
            <nav className="footer__links" aria-label={t('landing.footer.label')}>
              {links.map((l) => (l.href.startsWith('/') ? <Link key={l.label} to={l.href} viewTransition>{l.label}</Link> : <a key={l.label} href={l.href}>{l.label}</a>))}
            </nav>
          </div>
          <p>{t('landing.footer.made')} {t('landing.footer.private')}</p>
          <p className="footer__legal">{t('landing.footer.trademarks')}</p>
        </div>
      </footer>
    </div>
  )
}
