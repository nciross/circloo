import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Crown } from 'lucide-react'
import { Character } from '../../../components/Character'
import { isCharacter } from '../../../components/characters'
import { confetti, countUp, formatSeconds, REVEAL_MS } from '../../presentations/reveal'
import type { QuestionSlide, Results } from './presentation'

/** Colours of the cast and the brand, for confetti that belongs to circloo. */
const CONFETTI_COLORS = ['#ef4a32', '#22b8cc', '#ffc93c', '#0d5bd7', '#ff8fb1', '#1c7c52'] as const

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Milliseconds since the reveal mounted, ticking each frame until `duration`; the full duration at once under reduced motion. */
function useElapsed(duration: number, reduced: boolean) {
  const [elapsed, setElapsed] = useState(reduced ? duration : 0)
  useEffect(() => {
    if (reduced) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(duration, now - start)
      setElapsed(t)
      if (t < duration) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, reduced])
  return elapsed
}

/** One short burst over the results; nothing under reduced motion. Drawn on a canvas so 80 pieces cost one layer. */
function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const ratio = window.devicePixelRatio || 1
    const { width, height } = el.getBoundingClientRect()
    el.width = width * ratio
    el.height = height * ratio
    ctx.scale(ratio, ratio)
    const rtl = getComputedStyle(el).direction === 'rtl'
    const pieces = confetti(width < 600 ? 40 : 80, CONFETTI_COLORS)
    const duration = 1200
    let frame = 0
    const start = performance.now()
    const draw = (now: number) => {
      const t = (now - start) / duration
      ctx.clearRect(0, 0, width, height)
      for (const p of pieces) {
        const local = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)))
        if (local <= 0) continue
        const x = (rtl ? 1 - p.x : p.x) * width + p.drift * width * local
        const y = -20 + p.fall * height * local
        ctx.save()
        ctx.globalAlpha = 1 - local * local
        ctx.translate(x, y)
        ctx.rotate((p.spin * local * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.beginPath()
        if (p.shape === 'heart') {
          const s = p.size / 2
          ctx.moveTo(0, s * 0.6)
          ctx.bezierCurveTo(-s * 1.4, -s * 0.4, -s * 0.5, -s * 1.4, 0, -s * 0.5)
          ctx.bezierCurveTo(s * 0.5, -s * 1.4, s * 1.4, -s * 0.4, 0, s * 0.6)
        } else {
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        }
        ctx.fill()
        ctx.restore()
      }
      if (t < 1) frame = requestAnimationFrame(draw)
      else ctx.clearRect(0, 0, width, height)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={canvas} className="reveal__confetti" aria-hidden="true" />
}

/** The person who answered first (for a quiz, first right), with their character and time (spec 006 US5 #2). */
function Spotlight({ slide, results }: { slide: QuestionSlide; results: Results }) {
  const { t, i18n } = useTranslation()
  const quiz = slide.kind === 'quiz'
  const first = results.first
  if (!slide.showFirst || results.total === 0) return null
  if (!first) {
    return quiz ? <p className="reveal__spotlight is-nobody">{t('present.reveal.nobodyRight')}</p> : null
  }
  return (
    <section className="reveal__spotlight" aria-label={t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}>
      {isCharacter(first.character) ? <Character id={first.character} className="reveal__spotlight-char" /> : null}
      <p className="reveal__spotlight-text">
        <span className="reveal__spotlight-label">{t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}</span>
        <span className="reveal__spotlight-who">
          {t('present.reveal.who', { name: '\u2068' + first.name + '\u2069', time: '\u2068' + formatSeconds(first.ms, i18n.language) + '\u2069' })}
        </span>
      </p>
    </section>
  )
}

/**
 * Revealed results (spec 006 US5): bars grow from the inline start, figures count up, the most chosen options carry a
 * crown and a label, a quiz marks its right answer with an icon and a label (never colour alone), then the spotlight.
 * Screen readers get a table and one announcement. Under reduced motion everything shows at once, without confetti.
 * Mount it once per question (key by slide id) so it plays once.
 */
export function Reveal({ slide, results, mine, celebrate = true }: { slide: QuestionSlide; results: Results; mine?: string[]; celebrate?: boolean }) {
  const { t } = useTranslation()
  const [reduced] = useState(prefersReducedMotion)
  const elapsed = useElapsed(REVEAL_MS, reduced)
  const quiz = slide.kind === 'quiz'
  const label = (id: string) => slide.options.find((o) => o.id === id)?.text ?? id
  const summary = results.options.map((o) => t('present.reveal.row', { option: label(o.id), count: o.count, percent: o.percent })).join('; ')

  if (results.total === 0) {
    return (
      <div className="reveal">
        <p className="reveal__empty" role="status">{t('present.reveal.noAnswers')}</p>
      </div>
    )
  }

  return (
    <div className={['reveal', reduced ? 'is-still' : ''].filter(Boolean).join(' ')} style={{ '--reveal-ms': `${REVEAL_MS}ms` } as CSSProperties}>
      {celebrate && !reduced ? <Confetti /> : null}
      <ol className="reveal__options" aria-hidden="true">
        {slide.options.map((o, i) => {
          const r = results.options.find((x) => x.id === o.id)
          if (!r) return null
          return (
            <li key={o.id} className={['reveal__option', r.winner ? 'is-winner' : '', r.correct ? 'is-correct' : '', mine?.includes(o.id) ? 'is-mine' : ''].filter(Boolean).join(' ')}
              style={{ '--share': `${r.percent}%`, '--i': i } as CSSProperties}>
              <span className="reveal__bar" />
              <span className="stage-slide__letter">{i + 1}</span>
              <span className="reveal__text">
                <span dir="auto">{o.text}</span>
                <span className="reveal__marks">
                  {r.correct ? <span className="reveal__mark is-correct"><CircleCheck size={16} /> {t('present.reveal.correct')}</span> : null}
                  {r.winner && !quiz ? <span className="reveal__mark is-winner"><Crown size={16} /> {t('present.reveal.mostChosen')}</span> : null}
                  {mine?.includes(o.id) ? <span className="reveal__mark is-mine">{t('present.reveal.yours')}</span> : null}
                </span>
              </span>
              <span className="reveal__figures">
                <span className="reveal__percent">{countUp(r.percent, elapsed)}%</span>
                <span className="reveal__count">{t('present.reveal.votes', { count: countUp(r.count, elapsed) })}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <table className="visually-hidden">
        <caption>{t('present.reveal.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('present.reveal.option')}</th>
            <th scope="col">{t('present.reveal.count')}</th>
            <th scope="col">{t('present.reveal.percent')}</th>
          </tr>
        </thead>
        <tbody>
          {results.options.map((o) => (
            <tr key={o.id}>
              <th scope="row">
                {label(o.id)}
                {o.correct ? ` (${t('present.reveal.correct')})` : ''}
                {o.winner && !quiz ? ` (${t('present.reveal.mostChosen')})` : ''}
              </th>
              <td>{o.count}</td>
              <td>{o.percent}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Filled once the reveal is under way, so it is announced exactly once. */}
      <p className="visually-hidden" aria-live="polite">{elapsed > 0 ? t('present.reveal.announce', { summary }) : ''}</p>
      <Spotlight slide={slide} results={results} />
    </div>
  )
}
