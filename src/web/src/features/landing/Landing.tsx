import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Globe, MessageCircle, Pause, Play, Plus, Undo2, Users, type LucideIcon } from 'lucide-react'
import { SiteHeader } from '../../components/SiteHeader'
import { LanguageMenu } from '../../components/LanguageMenu'
import { useDocumentTitle } from '../../app/locale'
import { useUiStore } from '../../stores/ui'
import type { BirdMood } from '../pirikoo/Bird'
import { useLandingMotion } from './motion'
import { useStillMotion } from './useMotion'
import { useCompose, type Words } from './useCompose'
import type { Composition } from './compose'
import { Say } from './Say'
import { Made } from './Made'
import { Player } from './Player'
import { Jobs } from './Jobs'
import { Blobs } from './Blobs'
import { Rounds } from './Rounds'
import { Samples } from './Samples'
import { Who } from './Who'
import { Popular } from './Popular'
import { How } from './How'
import { Footer } from './Footer'
import '../../styles/landing.css'

const AUTO_DEMO_MS = 1200

/** A small pastel chip with an icon, set inside the headline where the locale string says `<chip/>`. */
function Chip({ icon: Icon, tone }: { icon: LucideIcon; tone: 'mint' | 'sky' | 'butter' }) {
  return (
    <span className={`hchip hchip--${tone}`} aria-hidden="true">
      <Icon strokeWidth={2.5} />
    </span>
  )
}

/** One headline line: the text around the `<chip/>` placeholder, with the chip in its place. */
function Line({ text, chip }: { text: string; chip: ReactNode }) {
  const [before, after] = text.split('<chip/>')
  return (
    <span className="hero__line">
      {before}
      {after !== undefined ? <>{chip}{after}</> : null}
    </span>
  )
}

/**
 * The landing (issue #247, #250): a white canvas in the language of a people platform. The prompt is the product:
 * one line composes a circle in front of the visitor. A sticky bar with a compact console, a centred headline with
 * pastel chips flanked by character blobs, then the rounds, the four languages, the composition as a join panel,
 * who it is for, popular circles, how it works, the story, the three jobs, the questions and the charcoal footer.
 * No scroll animations; every ambient movement has a still path and a pause.
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

  const scrollToMade = (block: ScrollLogicalPosition) => {
    document.getElementById('made')?.scrollIntoView({ behavior: playing ? 'smooth' : 'auto', block })
  }

  const build = (line: string) => {
    touched.current = true
    if (!line.trim()) return
    start(line)
    // The composition sits further down the page: bring it into view so the line is seen becoming a circle.
    scrollToMade('center')
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

  const faq = t('landing.faq.items', { returnObjects: true }) as { q: string; a: string }[]
  const touch = () => { touched.current = true }

  return (
    <div className={`site${motion.still ? ' is-still' : ''}`} data-motion={lm.on ? 'on' : 'off'}>
      <SiteHeader
        tone="site"
        showLanguages={false}
        links={(
          <div className="sitebar__centre">
            <Say
              compact
              text={text}
              onText={setText}
              onBuild={build}
              onTouch={touch}
              mood={mood}
              placeholder={t('landing.say.navPlaceholder')}
              trailing={(
                <span className="say__lang">
                  <Globe size={16} strokeWidth={2.25} aria-hidden="true" />
                  <span>{t(`common.languages.${locale}`)}</span>
                </span>
              )}
            />
          </div>
        )}
      >
        <LanguageMenu />
        <Link to="/signin" className="sitebar__signin" viewTransition>{t('landing.nav.login')}</Link>
        <Link to="/signin" className="btn btn--sm btn--charcoal" viewTransition>{t('landing.cta')}</Link>
      </SiteHeader>

      <main id="main">
        <section id="start" className="hero" aria-labelledby="hero-title">
          <Blobs />
          <div className="hero__copy">
            <h1 id="hero-title" className="hero__title">
              <Line text={t('landing.hero.l1')} chip={<Chip icon={Users} tone="mint" />} />
              <Line text={t('landing.hero.l2')} chip={<Chip icon={MessageCircle} tone="sky" />} />
              <Line text={t('landing.hero.l3')} chip={<Chip icon={Globe} tone="butter" />} />
            </h1>
            <p className="hero__lead">{t('landing.hero.lead')}</p>
            <Say
              text={text}
              onText={setText}
              onBuild={build}
              onTouch={touch}
              mood={mood}
              idle={playing ? 'idle' : undefined}
              examples={examples}
            />
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

        <section id="made" className="strip join" aria-label={t('landing.made.preview')}>
          <Made run={run} motion={playing} />
        </section>

        <Who />
        <Popular />
        <How />
        <Player still={motion.still} />
        <Jobs motion={playing} />

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
