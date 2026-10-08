import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MoodDemo } from './MoodDemo'
import { IcebreakerCard } from './IcebreakerCard'
import { useLandingMotion } from './motion'

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

/** Marks the row live once it is on screen, so its demo plays exactly once; at once when there is no observer. */
function Job({ id, title, body, children }: { id: string; title: string; body: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const { on } = useLandingMotion()
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
    <article ref={ref} className={`job job--${id}`} aria-labelledby={`job-${id}`}>
      <div className="job__copy">
        <h2 id={`job-${id}`} className="section-title">{title}</h2>
        <p className="section-lead">{body}</p>
      </div>
      <div className="job__show">{children}</div>
    </article>
  )
}

/** Three rows, no cards: each job shown by the real thing, at real size. The side alternates per row. */
export function Jobs({ motion }: { motion: boolean }) {
  const { t } = useTranslation()
  return (
    <section id="jobs" className="jobs" aria-label={t('landing.jobs.title')}>
      <Job id="feel" title={t('landing.feel.title')} body={t('landing.feel.body')}><MoodDemo motion={motion} /></Job>
      <Job id="work" title={t('landing.work.title')} body={t('landing.work.body')}><BoardDemo /></Job>
      <Job id="fun" title={t('landing.fun.title')} body={t('landing.fun.body')}><IcebreakerCard /></Job>
    </section>
  )
}
