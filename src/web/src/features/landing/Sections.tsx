import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Minus, Pause, Plus } from 'lucide-react'
import { ButtonLink } from '../../components/Button'
import { Segmented } from '../../components/Segmented'
import { Avatar } from '../../components/Avatar'
import { Character } from '../../components/Character'
import { MoodIcon, type Mood } from '../../components/MoodIcon'
import { useSignInStore } from '../../stores/signIn'
import { MoodDemo } from './MoodDemo'
import { useLandingMotion } from './motion'
import { tabKey, useCycle } from './useMotion'
import { INTEGRATIONS } from './integrations'

const arrow = <ArrowRight className="flip-rtl" size={18} strokeWidth={2.25} />

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

interface CheckinItem { name: string; mood: string; need: string }
const CHECKIN_MOODS: Mood[] = [5, 3, 4, 2]

/* ---------------------------------------------------------------- Hero form */

/** Who it is for, then an email: the choice swaps the word in the line above and the email starts the sign-up. */
export function HeroForm({ still = false }: { still?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const kinds = t('landing2.hero.kinds', { returnObjects: true }) as { id: string; label: string; word: string }[]
  const [picked, setPicked] = useState<string | null>(null)
  const auto = useCycle(kinds.length, 2600, still || picked !== null)
  const current = kinds.find((k) => k.id === picked) ?? kinds[auto]!
  const [email, setEmail] = useState('')
  return (
    <form
      className="heroform"
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) {
          // A new address starts a fresh sign-in, never a half-finished one waiting for another address's code.
          useSignInStore.getState().reset()
          useSignInStore.setState({ email: email.trim() })
        }
        void navigate('/signin', { viewTransition: true })
      }}
    >
      <p className="rotator">
        <span>{t('landing2.hero.madeFor')}</span>{' '}
        <span className="rotator__stage" aria-hidden="true">
          {kinds.map((k) => <span key={k.id} className="rotator__ghost">{k.word}</span>)}
          <span key={current.id} className="rotator__word">{current.word}</span>
        </span>
        <span className="visually-hidden">{kinds.map((k) => k.word).join(', ')}</span>
      </p>
      <Segmented
        label={t('landing2.hero.kindLabel')}
        choices={kinds.map((k) => ({ value: k.id, label: k.label }))}
        value={current.id}
        onChange={setPicked}
        className="heroform__kind"
      />
      <div className="heroform__row">
        <label className="visually-hidden" htmlFor="hero-email">{t('auth.emailLabel')}</label>
        <input id="hero-email" className="input heroform__input" type="email" inputMode="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn btn--primary btn--lg">
          <span className="btn__icon" aria-hidden="true">{arrow}</span>
          <span className="btn__label">{t('landing.cta')}</span>
        </button>
      </div>
      <p className="heroform__note">{t('landing2.hero.note')}</p>
    </form>
  )
}

/** Small product cards drifting around the circle: decorative, the copy says the same in words. */
export function FloatingCards() {
  const { t } = useTranslation()
  return (
    <div className="floats" aria-hidden="true">
      <div className="float float--a"><Avatar name="Amina" size="sm" /><span><b>Amina</b> {t('landing.float.checkin')} <MoodIcon mood={5} size={14} /></span></div>
      <div className="float float--b"><span className="float__dot" /><span>{t('landing.float.note')}</span></div>
      <div className="float float--c"><Avatar name="Théo" size="sm" /><span><b>Théo</b> {t('landing.float.typing')}</span></div>
      <div className="float-cursor"><svg viewBox="0 0 16 16"><path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" /></svg><span>Lucía</span></div>
    </div>
  )
}

/* ------------------------------------------------------------- Logo strip */

export function LogoStrip() {
  const { t } = useTranslation()
  return (
    <section className="logos" aria-label={t('landing2.logos.eyebrow')}>
      <p className="eyebrow">{t('landing2.logos.eyebrow')}</p>
      <div className="marquee">
        <div className="marquee__track" aria-hidden="true">
          {[0, 1].map((k) => (
            <ul key={k} className="marquee__set">
              {INTEGRATIONS.map((p) => (
                <li key={p.id} className="marquee__item">
                  {p.logos.map((l) => <img key={l} src={`/brands/${l}.svg`} alt="" width="28" height="28" />)}
                  <span lang="en" dir="ltr">{p.name}</span>
                  {p.id === 'salesforce' ? <span className="marquee__soon">{t('common.soon')}</span> : null}
                </li>
              ))}
            </ul>
          ))}
        </div>
        <ul className="visually-hidden">
          {INTEGRATIONS.map((p) => <li key={p.id}><span lang="en">{p.name}</span>{p.id === 'salesforce' ? ` (${t('common.soon')})` : null}</li>)}
        </ul>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- Shared demos */

export function BoardDemo() {
  const { t } = useTranslation()
  const notes = t('landing.work.notes', { returnObjects: true }) as string[]
  return (
    <div className="demo-board" role="group" aria-label={t('landing.work.title')}>
      <span className="demo-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" /></svg><span>Lucía</span></span>
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
  )
}

export function Jokes() {
  const { t } = useTranslation()
  return (
    <ul className="jokes">
      {FUN_CARDS.map((c) => (
        <li key={c.lang} className="joke" lang={c.lang} dir={c.lang === 'ar' ? 'rtl' : 'ltr'}>
          <span className="joke__lang" aria-hidden="true">{t(`common.languageShort.${c.lang}`)}</span>
          <p>{c.text}</p>
        </li>
      ))}
    </ul>
  )
}

function CheckinsMock() {
  const { t } = useTranslation()
  const items = t('landing.checkins.items', { returnObjects: true }) as CheckinItem[]
  return (
    <div className="checkins">
      <p className="checkins__title">{t('landing.checkins.title')} <span className="lozenge lozenge--neutral">{t('common.example')}</span></p>
      <ul className="checkins__list">
        {items.map((c, i) => (
          <li key={c.name} className="checkin">
            <Avatar name={c.name} size="sm" />
            <span className="checkin__name"><bdi>{c.name}</bdi></span>
            <span className="checkin__mood"><MoodIcon mood={CHECKIN_MOODS[i] ?? 3} size={16} /> {c.mood}</span>
            <span className="checkin__need">{c.need}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------- Audience tabs */

interface Audience { id: 'family' | 'friends' | 'team'; tab: string; title: string; body: string; bullets: string[]; cta: string }

/** Pill tabs; the card below is replaced with a short slide when another one is picked. */
export function AudienceTabs() {
  const { t } = useTranslation()
  const items = t('landing2.audience.items', { returnObjects: true }) as Audience[]
  const [id, setId] = useState<Audience['id']>('family')
  const a = items.find((x) => x.id === id) ?? items[0]!
  return (
    <section id="audience" className="band band--sunken" aria-labelledby="aud-title">
      <div className="band__inner">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.audience.eyebrow')}</p>
          <h2 id="aud-title" className="section-title">{t('landing2.audience.title')}</h2>
          <p>{t('landing2.audience.lead')}</p>
        </div>
        <div className="pilltabs" role="tablist" aria-label={t('landing2.audience.eyebrow')}>
          {items.map((x, k) => (
            <button key={x.id} id={`aud-tab-${x.id}`} type="button" role="tab" className="pilltab" aria-selected={x.id === id} aria-controls="aud-panel" tabIndex={x.id === id ? 0 : -1}
              onClick={() => setId(x.id)}
              onKeyDown={(e) => {
                const next = tabKey(e, k, items.length)
                if (next === null) return
                const n = items[next]!
                setId(n.id)
                document.getElementById(`aud-tab-${n.id}`)?.focus()
              }}>
              {x.tab}
            </button>
          ))}
        </div>
        <div key={id} id="aud-panel" role="tabpanel" tabIndex={0} aria-labelledby={`aud-tab-${id}`} className="audcard">
          <div className="audcard__copy">
            <h3 className="audcard__title">{a.title}</h3>
            <p>{a.body}</p>
            <ul className="checks">{a.bullets.map((b) => <li key={b}><Check size={18} aria-hidden="true" /> {b}</li>)}</ul>
            <ButtonLink to="/signin" icon={arrow}>{a.cta}</ButtonLink>
          </div>
          <div className="audcard__show">
            {id === 'family' ? <CheckinsMock /> : id === 'friends' ? <Jokes /> : <BoardDemo />}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- Three jobs */

interface Job { id: 'feel' | 'work' | 'fun'; label: string; status: string; title: string; body: string; bullets: string[] }
const AUTO_MS = 7000

/**
 * A list on the left, a feature panel on the right. It advances by itself until someone takes over: picking a tab,
 * the visible pause button or the page-wide pause stops it for good; hover and focus only hold it (WCAG 2.2.2).
 */
export function Jobs({ soon, still = false }: { soon: string; still?: boolean }) {
  const { t } = useTranslation()
  const jobs = t('landing2.jobs.items', { returnObjects: true }) as Job[]
  const [i, setI] = useState(0)
  const [manual, setManual] = useState(false)
  const [paused, setPaused] = useState(false)
  const { on: motion } = useLandingMotion()
  const auto = motion && !manual && !still
  useEffect(() => {
    if (!auto || paused) return
    const id = window.setTimeout(() => setI((n) => (n + 1) % jobs.length), AUTO_MS)
    return () => window.clearTimeout(id)
  }, [i, auto, paused, jobs.length])
  const pick = (k: number) => {
    setManual(true)
    setI(k)
  }
  const job = jobs[i]!
  return (
    <section id="product" className="band" aria-labelledby="jobs-title">
      <div className="band__inner">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.jobs.eyebrow')}</p>
          <h2 id="jobs-title" className="section-title">{t('landing2.jobs.title')}</h2>
          <p>{t('landing2.jobs.lead')}</p>
        </div>
        <div className="jobs" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
          <div className="jobs__side">
            <div className="jobs__list" role="tablist" aria-orientation="vertical" aria-label={t('landing2.jobs.eyebrow')}>
              {jobs.map((j, k) => (
                <button key={j.id} type="button" role="tab" id={`job-tab-${j.id}`} aria-selected={k === i} aria-controls="job-panel" className="jobtab" tabIndex={k === i ? 0 : -1}
                  onClick={() => pick(k)}
                  onKeyDown={(e) => {
                    const next = tabKey(e, k, jobs.length, true)
                    if (next === null) return
                    pick(next)
                    document.getElementById(`job-tab-${jobs[next]!.id}`)?.focus()
                  }}>
                  <span className="jobtab__label">{j.label}</span>
                  <span className="jobtab__bar" aria-hidden="true">
                    <span key={`${i}-${auto}-${paused}`} className={k === i && auto ? 'is-running' : ''} style={{ animationDuration: `${AUTO_MS}ms` }} />
                  </span>
                </button>
              ))}
            </div>
            {auto ? (
              <button type="button" className="motion-toggle" onClick={() => {
                // The button goes away once auto-play stops: keep focus in the list, on the current tab.
                setManual(true)
                document.getElementById(`job-tab-${job.id}`)?.focus()
              }}>
                <Pause size={14} aria-hidden="true" /> {t('landing2.jobs.pause')}
              </button>
            ) : null}
          </div>
          <div key={job.id} id="job-panel" role="tabpanel" tabIndex={0} aria-labelledby={`job-tab-${job.id}`} className="jobpanel">
            <div className="jobpanel__copy">
              <span className={`lozenge ${job.id === 'fun' ? 'lozenge--success' : 'lozenge--neutral'}`}>{job.status}</span>
              <h3 className="jobpanel__title">{job.title} {job.id !== 'fun' ? <span className="lozenge lozenge--neutral">{soon}</span> : null}</h3>
              <p>{job.body}</p>
              <ul className="checks">{job.bullets.map((b) => <li key={b}><Check size={18} aria-hidden="true" /> {b}</li>)}</ul>
            </div>
            <div className="jobpanel__show">
              {job.id === 'feel' ? <MoodDemo /> : job.id === 'work' ? <BoardDemo /> : <Jokes />}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------- Platform strip */

export function PlatformStrip() {
  const { t } = useTranslation()
  const pills = t('landing2.platform.pills', { returnObjects: true }) as string[]
  return (
    <div className="band__inner">
      <div className="platform">
        <p className="platform__title">{t('landing2.platform.title')}</p>
        <ul className="platform__pills">{pills.map((p) => <li key={p}><span aria-hidden="true" />{p}</li>)}</ul>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Facts */

/** Counts up to `to` once it is on screen. The real number is what assistive tech reads, the moving one is hidden. */
function CountUp({ to }: { to: number }) {
  const { on } = useLandingMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(to)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || to === 0 || !on || !('IntersectionObserver' in window)) return
    setShown(0)
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / 1300)
        setShown(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.6 })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      setShown(to)
    }
  }, [to, on])
  return (
    <>
      <span ref={ref} aria-hidden="true">{shown}</span>
      <span className="visually-hidden">{to}</span>
    </>
  )
}

export function Facts({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const items = t('landing2.facts.items', { returnObjects: true }) as { n: number; label: string; body: string }[]
  return (
    <section id="facts" className="band band--sunken" aria-labelledby="facts-title">
      <div className="band__inner">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.facts.eyebrow')}</p>
          <h2 id="facts-title" className="section-title">{t('landing2.facts.title')}</h2>
          <p>{t('landing2.facts.lead')}</p>
        </div>
        <ul className="facts">
          {items.map((f) => (
            <li key={f.label} className="fact">
              <p className="fact__n"><CountUp to={f.n} /></p>
              <p className="fact__label">{f.label}</p>
              <p className="fact__body">{f.body}</p>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  )
}

/* ------------------------------------------------------- Principles carousel */

export function Principles() {
  const { t } = useTranslation()
  const items = t('landing2.principles.items', { returnObjects: true }) as { title: string; body: string }[]
  const [i, setI] = useState(0)
  const go = (n: number) => setI((n + items.length) % items.length)
  const p = items[i]!
  return (
    <section id="principles" className="band" aria-labelledby="pr-title">
      <div className="band__inner narrow">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.principles.eyebrow')}</p>
          <h2 id="pr-title" className="section-title">{t('landing2.principles.title')}</h2>
        </div>
        <figure className="quote">
          <div className="quote__side">
            <Character id="owl" className="quote__char" />
            <p className="quote__who">{t('landing2.principles.who')}</p>
            <p className="quote__count" aria-hidden="true">{i + 1} / {items.length}</p>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <blockquote key={i} className="quote__main">
              <span className="quote__mark" aria-hidden="true">“</span>
              <p className="quote__title">{p.title}</p>
              <p>{p.body}</p>
            </blockquote>
          </div>
        </figure>
        <div className="carousel">
          <button type="button" className="icon-btn" aria-label={t('landing2.principles.prev')} onClick={() => go(i - 1)}><ChevronLeft className="flip-rtl" size={18} aria-hidden="true" /></button>
          <div className="carousel__dots">
            {items.map((x, k) => <button key={x.title} type="button" className="carousel__dot" aria-label={x.title} aria-current={k === i} onClick={() => setI(k)} />)}
          </div>
          <button type="button" className="icon-btn" aria-label={t('landing2.principles.next')} onClick={() => go(i + 1)}><ChevronRight className="flip-rtl" size={18} aria-hidden="true" /></button>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- Comparison table */

export function Compare() {
  const { t } = useTranslation()
  const cols = t('landing2.compare.cols', { returnObjects: true }) as string[]
  const rows = t('landing2.compare.rows', { returnObjects: true }) as { label: string; has: boolean[] }[]
  return (
    <section id="compare" className="band band--sunken" aria-labelledby="cmp-title">
      <div className="band__inner">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.compare.eyebrow')}</p>
          <h2 id="cmp-title" className="section-title">{t('landing2.compare.title')}</h2>
          <p>{t('landing2.compare.lead')}</p>
        </div>
        <div className="tablewrap" role="region" tabIndex={0} aria-labelledby="cmp-title">
          <table className="compare">
            <caption className="visually-hidden">{t('landing2.compare.title')}</caption>
            <thead>
              <tr>
                <th scope="col"><span className="visually-hidden">{t('landing2.compare.feature')}</span></th>
                {cols.map((c, i) => <th key={c} scope="col" className={i === cols.length - 1 ? 'is-us' : ''}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {r.has.map((h, i) => (
                    <td key={i} className={i === r.has.length - 1 ? 'is-us' : ''}>
                      {h ? <><Check size={18} aria-hidden="true" /><span className="visually-hidden">{t('landing2.compare.yes')}</span></> : <><Minus size={16} aria-hidden="true" /><span className="visually-hidden">{t('landing2.compare.no')}</span></>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="section-head--center cmp__cta"><ButtonLink to="/signin" icon={arrow}>{t('landing.cta')}</ButtonLink></div>
      </div>
    </section>
  )
}

/* ----------------------------------------------------------------- FAQ */

export function Faq() {
  const { t } = useTranslation()
  const items = t('landing2.faq.items', { returnObjects: true }) as { q: string; a: string }[]
  return (
    <section id="faq" className="band band--sunken" aria-labelledby="faq-title">
      <div className="band__inner narrow">
        <div className="section-head section-head--center">
          <p className="eyebrow">{t('landing2.faq.eyebrow')}</p>
          <h2 id="faq-title" className="section-title">{t('landing2.faq.title')}</h2>
          <p>{t('landing2.faq.lead')}</p>
        </div>
        <div className="faq">
          {items.map((f, i) => (
            <details key={f.q} className="faqrow" name="faq" open={i === 0}>
              <summary className="faqrow__sum"><span>{f.q}</span><span className="faqrow__plus" aria-hidden="true"><Plus size={16} /></span></summary>
              <div className="faqrow__body"><p>{f.a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------ Final banner */

export function Drifters() {
  return (
    <div className="drifters" aria-hidden="true">
      {(['fox', 'panda', 'octopus', 'robot', 'frog'] as const).map((c, i) => <Character key={c} id={c} className={`drifter drifter--${i}`} />)}
    </div>
  )
}
