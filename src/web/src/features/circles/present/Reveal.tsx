import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Crown } from 'lucide-react'
import { Character } from '../../../components/Character'
import { isCharacter } from '../../../components/characters'
import { confetti, countUp, formatPercent, formatSeconds, REVEAL_MS, STAGGER_MS } from '../../presentations/reveal'
import type { QuestionSlide, Results } from './presentation'

/** Read from the theme, so a question style (#168) can change them; these are the fallbacks. */
const CONFETTI_VARS = ['--confetti-1', '--confetti-2', '--confetti-3', '--confetti-4', '--confetti-5', '--confetti-6'] as const
const CONFETTI_FALLBACK = ['#ef4a32', '#22b8cc', '#ffc93c', '#2a73e8', '#ff8fb1', '#3ddc97']

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

/**
 * One short burst once the answer is known (when the spotlight lands), falling over the spotlight end of the results
 * rather than over the figures. Nothing under reduced motion. One canvas layer for up to 80 pieces.
 */
function Confetti({ delay }: { delay: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    // Bounded, so a 4K projector does not get a huge canvas.
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const { width, height } = el.getBoundingClientRect()
    el.width = width * ratio
    el.height = height * ratio
    ctx.scale(ratio, ratio)
    const style = getComputedStyle(el)
    const rtl = style.direction === 'rtl'
    const colors = CONFETTI_VARS.map((v, i) => style.getPropertyValue(v).trim() || CONFETTI_FALLBACK[i] || '#22b8cc')
    const pieces = confetti(width < 600 ? 40 : 80, colors)
    const duration = 1200
    let frame = 0
    let start = 0
    const draw = (now: number) => {
      start ||= now
      const t = (now - start) / duration
      ctx.clearRect(0, 0, width, height)
      for (const p of pieces) {
        const local = Math.min(1, Math.max(0, (t - p.delay) / (1 - p.delay)))
        if (local <= 0) continue
        // From the inline start (where the spotlight sits) across half the width; the drift follows the reading direction.
        const across = p.x * 0.6 + p.drift * local
        const x = (rtl ? 1 - across : across) * width
        // (Mirroring `across` mirrors the drift too.)
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
      else setDone(true)
    }
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(draw)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [delay])
  return done ? null : <canvas ref={canvas} className="reveal__confetti" aria-hidden="true" />
}

/** Whether anyone chose the right answer of a quiz. */
const someoneRight = (results: Results) => results.options.some((o) => o.correct && o.count > 0)

/**
 * The person who answered first (for a quiz, first right), with their character and time (spec 006 US5 #2), or for a
 * quiz nobody got right, a kind line (US6 #2) whatever the spotlight setting, since it names nobody.
 */
function Spotlight({ slide, results, text }: { slide: QuestionSlide; results: Results; text: string | null }) {
  const { t } = useTranslation()
  const quiz = slide.kind === 'quiz'
  const first = results.first
  if (results.total === 0) return null
  if (quiz && !someoneRight(results)) return <p className="reveal__spotlight is-nobody">{t('present.reveal.nobodyRight')}</p>
  if (!slide.showFirst || !first || !text) return null
  return (
    <section className="reveal__spotlight" aria-label={t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}>
      {isCharacter(first.character) ? <Character id={first.character} ring={first.ring ?? 0} className="reveal__spotlight-char" /> : null}
      <p className="reveal__spotlight-text">
        <span className="reveal__spotlight-label">{t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}</span>
        <span className="reveal__spotlight-who">{text}</span>
      </p>
    </section>
  )
}

/**
 * Revealed results (spec 006 US5): bars grow from the inline start, figures count up in step with them, the most
 * chosen options of a poll carry a crown and a label, a quiz marks its right answer with an icon and a label (never
 * colour alone), then the spotlight and the confetti. Screen readers get a table and one announcement with the marks
 * and the spotlight. Under reduced motion everything shows at once, without confetti.
 * Only the reveal this page saw happen plays (animate); coming back to it, unblanking or reloading shows the stored
 * results still and silent.
 */
export function Reveal({ slide, results, mine, animate }: { slide: QuestionSlide; results: Results; mine?: string[]; animate: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [reduced] = useState(() => !animate || prefersReducedMotion())
  const total = REVEAL_MS + STAGGER_MS * Math.max(0, slide.options.length - 1)
  const elapsed = useElapsed(total, reduced)
  const quiz = slide.kind === 'quiz'
  const label = (id: string) => slide.options.find((o) => o.id === id)?.text ?? id
  const marks = (o: Results['options'][number]) =>
    [o.correct ? t('present.reveal.correct') : '', o.winner ? t('present.reveal.mostChosen') : '', mine?.includes(o.id) ? t('present.reveal.yours') : '']
      .filter(Boolean)
      .join(', ')
  const first = results.first
  const who = first ? t('present.reveal.who', { name: '⁨' + first.name + '⁩', time: '⁨' + formatSeconds(first.ms, lang) + '⁩' }) : null
  const showSpotlight = slide.showFirst && first && who && (!quiz || someoneRight(results))

  // One announcement, written once the region is on the page so screen readers hear it (also under reduced motion).
  const [announcement, setAnnouncement] = useState('')
  const summary = results.options
    .map((o) => {
      const m = marks(o)
      return t('present.reveal.row', { option: label(o.id), count: o.count, percent: formatPercent(o.percent, lang) }) + (m ? ` (${m})` : '')
    })
    .join('; ')
  const spoken = t('present.reveal.announce', { summary }) + (showSpotlight ? ` ${t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}: ${who}.` : '')
  useEffect(() => {
    if (!animate) return
    const timer = window.setTimeout(() => setAnnouncement(spoken), 100)
    return () => window.clearTimeout(timer)
    // Announced once per reveal; later updates of the same results stay silent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (results.total === 0) {
    return (
      <div className="reveal">
        <p className="reveal__empty">{t('present.reveal.noAnswers')}</p>
        <p className="visually-hidden" aria-live="polite">{announcement ? t('present.reveal.noAnswers') : ''}</p>
      </div>
    )
  }

  // Confetti only once there is something to celebrate: an answer to a poll, or someone right in a quiz.
  const party = !reduced && (!quiz || someoneRight(results))

  return (
    <div className={['reveal', reduced ? 'is-still' : ''].filter(Boolean).join(' ')} style={{ '--reveal-ms': `${REVEAL_MS}ms`, '--stagger-ms': `${STAGGER_MS}ms` } as CSSProperties}>
      {party ? <Confetti delay={total + 150} /> : null}
      <ol className="reveal__options" aria-hidden="true">
        {slide.options.map((o, i) => {
          const r = results.options.find((x) => x.id === o.id)
          if (!r) return null
          const local = elapsed - i * STAGGER_MS
          return (
            <li key={o.id} className={['reveal__option', r.winner ? 'is-winner' : '', r.correct ? 'is-correct' : '', mine?.includes(o.id) ? 'is-mine' : ''].filter(Boolean).join(' ')}
              style={{ '--share': `${r.percent}%`, '--i': i } as CSSProperties}>
              <span className="reveal__bar" />
              <span className="stage-slide__letter">{i + 1}</span>
              <span className="reveal__text">
                <bdi className="reveal__label">{o.text}</bdi>
                <span className="reveal__marks">
                  {r.correct ? <span className="reveal__mark is-correct"><CircleCheck size={16} /> {t('present.reveal.correct')}</span> : null}
                  {r.winner ? <span className="reveal__mark is-winner"><Crown size={16} /> {t('present.reveal.mostChosen')}</span> : null}
                  {mine?.includes(o.id) ? <span className="reveal__mark is-mine">{t('present.reveal.yours')}</span> : null}
                </span>
              </span>
              <span className="reveal__figures">
                <span className="reveal__percent">{formatPercent(countUp(r.percent, local), lang)}</span>
                <span className="reveal__count">{t(quiz ? 'present.reveal.answers' : 'present.reveal.votes', { count: countUp(r.count, local) })}</span>
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
                {marks(o) ? ` (${marks(o)})` : ''}
              </th>
              <td>{o.count}</td>
              <td>{formatPercent(o.percent, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
      <Spotlight slide={slide} results={results} text={who} />
    </div>
  )
}
