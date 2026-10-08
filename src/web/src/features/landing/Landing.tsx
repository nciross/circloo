import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowRight, Check, Pause, Play, Plus, Undo2, UserRound } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { ButtonLink } from '../../components/Button'
import { Wordmark } from '../../components/Brand'
import { LanguageMenu } from '../../components/LanguageMenu'
import { useDocumentTitle } from '../../app/locale'
import { useUiStore } from '../../stores/ui'
import type { BirdMood } from '../pirikoo/Bird'
import { INTEGRATIONS } from './integrations'
import { useLandingMotion } from './motion'
import { useStillMotion } from './useMotion'
import { useCompose, type Words } from './useCompose'
import type { Composition } from './compose'
import { Say } from './Say'
import { Arrow, Made } from './Made'
import { Player } from './Player'
import { Jobs } from './Jobs'
import '../../styles/landing.css'

const AUTO_DEMO_MS = 1200

/** The yellow marker stroke under the last line of the title. */
const Underline = () => (
  <svg className="console__stroke" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M3 9 C 40 3, 80 11, 120 6 S 180 4, 197 8" />
  </svg>
)

/** Two small flat props on the hero's bottom edge: a sticky-note corner and a pencil. Colours live in the SVG. */
const Props = () => (
  <>
    <svg className="console__prop console__prop--note" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
      <path d="M12 18 L 108 6 L 118 80 L 2 80 Z" fill="#fff3b0" />
      <path d="M12 18 L 108 6 L 118 80" fill="none" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 40 L 90 34 M 32 54 L 80 50" stroke="#111111" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
    </svg>
    <svg className="console__prop console__prop--pencil" viewBox="0 0 160 40" aria-hidden="true" focusable="false">
      <path d="M20 12 L 130 12 L 130 28 L 20 28 Z" fill="#ffd23f" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M130 12 L 154 20 L 130 28 Z" fill="#f4e3c0" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M146 17.5 L 154 20 L 146 22.5 Z" fill="#111111" />
      <path d="M8 12 L 20 12 L 20 28 L 8 28 Z" fill="#ef4a32" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
      <path d="M36 20 L 118 20" stroke="#111111" strokeWidth="3" strokeLinecap="round" opacity="0.25" />
    </svg>
  </>
)

/**
 * The landing (issue #247, buddy list #250): the prompt is the product. One line composes a circle in front of the
 * visitor on a cobalt field, then the story clips, the three jobs shown by the real thing, the four languages, the
 * integrations, the free plan, the FAQ and one more line, all on white. Mobile first; every animation has a still
 * path and a pause.
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
      <SiteHeader tone="field" showLanguages={false}>
        <Link to="/signin" className="sitebar__signin" viewTransition>{t('common.signIn')}</Link>
        <LanguageMenu />
        <ButtonLink to="/signin" variant="default" size="sm" icon={<UserRound size={16} strokeWidth={2.25} />}>{t('landing.cta')}</ButtonLink>
      </SiteHeader>

      <main id="main">
        <section id="start" className="console on-field" aria-labelledby="hero-title">
          <div className="console__inner">
            <div className="console__copy">
              <h1 id="hero-title" className="console__title">
                {t('landing.hero.title')} <span className="console__title2">{t('landing.hero.title2')}<Underline /></span>
              </h1>
              <p className="console__lead">{t('landing.hero.lead')}</p>
              <div className="console__say">
                <Say
                  text={text}
                  onText={setText}
                  onBuild={build}
                  onTouch={() => { touched.current = true }}
                  mood={mood}
                  idle={playing ? 'idle' : undefined}
                  examples={examples}
                />
                <span className="note note--say" aria-hidden="true">
                  <span className="note__text">{t('landing.notes.say')}</span>
                  <Arrow />
                </span>
              </div>
              <ul className="console__facts">
                {facts.map((f) => <li key={f}><bdi>{f}</bdi></li>)}
              </ul>
            </div>
            <div id="made" className="console__made">
              <Made run={run} motion={playing} />
            </div>
            <div className="console__foot">
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
          <Props />
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
            <div className="panel panel--dark plugs__card">
              <div className="panel__head">
                <h2 id="plugs-title" className="panel__title">{t('landing.integrations.title')}</h2>
              </div>
              <div className="panel__body">
                <p className="plugs__lead">{t('landing.integrations.body')}</p>
                <ul className="plugs__list">
                  {INTEGRATIONS.map((p) => (
                    <li key={p.id} className="buddy plug">
                      <span className="buddy__char plug__logos" aria-hidden="true">
                        {p.logos.map((l) => <img key={l} className="plug__logo" src={`/brands/${l}.svg`} alt="" width="44" height="44" />)}
                      </span>
                      <span className="buddy__name plug__name" lang="en" dir="ltr">{p.name}</span>
                      <span className="buddy__status plug__what">{t(`landing.integrations.items.${p.id}`)}</span>
                      <span className="buddy__value plug__status">
                        {p.id === 'salesforce'
                          ? <span className="lozenge">{t('landing.integrations.stamp')}</span>
                          : <span className="lozenge lozenge--success">{t('landing.integrations.available')}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="free" className="free" aria-labelledby="free-title">
          <div className="free__inner">
            <h2 id="free-title" className="section-title">{t('landing.free.title')}</h2>
            <ul className="free__facts">
              {free.map((f) => <li key={f}><Check size={20} strokeWidth={2.5} aria-hidden="true" /> {f}</li>)}
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
                  <summary className="faqrow__sum"><span>{f.q}</span><span className="faqrow__plus" aria-hidden="true"><Plus size={20} strokeWidth={2.5} /></span></summary>
                  <div className="faqrow__body"><p>{f.a}</p></div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="again" aria-labelledby="again-title">
          <div className="again__inner">
            <h2 id="again-title" className="again__title">{t('landing.final.title')}</h2>
            <p className="again__lead">{t('landing.final.body')}</p>
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
