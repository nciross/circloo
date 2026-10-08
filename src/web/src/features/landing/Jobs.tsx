import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ArrowUpRight, CloudSun, Feather, Languages, MessageSquareText, MousePointer2, Presentation, Smile, StickyNote, Users, type LucideIcon } from 'lucide-react'
import { MoodDemo } from './MoodDemo'
import { IcebreakerCard } from './IcebreakerCard'
import { useLandingMotion } from './motion'
import { Band, Item, Reveal } from './Band'

const BOARD = [
  { col: 'well', notes: [0], votes: [3] },
  { col: 'improve', notes: [1, 3], votes: [5, 2] },
  { col: 'actions', notes: [2, 4], votes: [4, 1] },
] as const

export function BoardDemo() {
  const { t } = useTranslation()
  const notes = t('landing.work.notes', { returnObjects: true }) as string[]
  return (
    <div className="demo-board" role="group" aria-label={t('landing.work.title')}>
      <span className="demo-cursor" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1.5 1.5 L14 7.2 L8.4 8.6 L6.3 14.2 Z" /></svg><span>Lucía</span></span>
      {BOARD.map((c) => (
        <div key={c.col} className={`demo-board__col demo-board__col--${c.col}`}>
          <p className="demo-board__head">{t(`landing.work.columns.${c.col}`)} <span className="demo-board__count">{c.notes.length}</span></p>
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

/** The three icons of each row's bullets, in the order of the locale's `points`. */
const ICONS: Record<string, [LucideIcon, LucideIcon, LucideIcon]> = {
  feel: [CloudSun, MessageSquareText, Users],
  work: [StickyNote, MousePointer2, Presentation],
  fun: [Languages, Smile, Feather],
}

/**
 * One feature row: eyebrow, headline, one line, three icon bullets and an accent link at the start; the real thing
 * on a tinted panel at the end (sides alternate per row). Marks itself live once on screen, so its demo plays
 * exactly once; at once when there is no observer.
 */
function Job({ id, children }: { id: string; children: ReactNode }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLElement>(null)
  const { on } = useLandingMotion()
  const points = t(`landing.${id}.points`, { returnObjects: true }) as { title: string; body: string }[]
  const icons = ICONS[id]!
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!on || !('IntersectionObserver' in window)) {
      el.classList.add('is-live')
      return
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return
      el.classList.add('is-live')
      io.disconnect()
    }, { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  }, [on])
  return (
    <article ref={ref} id={id} className={`job job--${id}`} aria-labelledby={`job-${id}`}>
      <Reveal className="job__copy">
        <Item>
          <p className="eyebrow">{t(`landing.${id}.eyebrow`)}</p>
          <h2 id={`job-${id}`} className="band__title">{t(`landing.${id}.title`)}</h2>
        </Item>
        <Item><p className="band__lead">{t(`landing.${id}.intro`)}</p></Item>
        <Item as="div">
          <ul className="points">
            {points.map((p, i) => {
              const Icon = icons[i] ?? Smile
              return (
                <li key={p.title} className="point">
                  <Icon className="point__icon" size={20} strokeWidth={2.25} aria-hidden="true" />
                  <span className="point__title">{p.title}</span>
                  <span className="point__body">{p.body}</span>
                </li>
              )
            })}
          </ul>
        </Item>
        <Item>
          <Link to="/signin" className="golink" viewTransition>
            {t('landing.jobs.go')} <ArrowUpRight className="flip-rtl" size={18} strokeWidth={2.5} aria-hidden="true" />
          </Link>
        </Item>
      </Reveal>
      <div className="job__show">
        <div className="diagram">{children}</div>
      </div>
    </article>
  )
}

/** Three rows, sides alternating: each job shown by the real thing, at real size. */
export function Jobs({ motion }: { motion: boolean }) {
  const { t } = useTranslation()
  return (
    <Band id="jobs" className="jobs" label={t('landing.jobs.title')}>
      <Job id="feel"><MoodDemo motion={motion} /></Job>
      <Job id="work"><BoardDemo /></Job>
      <Job id="fun"><IcebreakerCard /></Job>
    </Band>
  )
}
