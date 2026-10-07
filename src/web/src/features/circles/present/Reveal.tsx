import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, type Variants } from 'motion/react'
import { CircleCheck, Crown } from 'lucide-react'
import { Character } from '../../../components/Character'
import { isAnyCharacter } from '../../../components/characters'
import { dur, easeOut, listVariants, spring, useReducedMotion } from '../../../lib/motion'
import { confetti, countUp, formatPercent, formatSeconds, REVEAL_MS, STAGGER_MS } from '../../presentations/reveal'
import type { QuestionSlide, Results } from './presentation'

/** Read from the theme (present.css sets them to the skies and brass), so a question style (#168) can change them. */
const CONFETTI_VARS = ['--confetti-1', '--confetti-2', '--confetti-3', '--confetti-4', '--confetti-5', '--confetti-6'] as const
const CONFETTI_FALLBACK = ['#f2c14e', '#8cc4f5', '#8c6a1f', '#c6cdd8', '#1c7c52', '#a3adbd']

/** Milliseconds since the reveal mounted, ticking each frame until `duration`; the full duration at once when still. */
function useElapsed(duration: number, still: boolean) {
  const [elapsed, setElapsed] = useState(still ? duration : 0)
  useEffect(() => {
    if (still) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(duration, now - start)
      setElapsed(t)
      if (t < duration) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [duration, still])
  return elapsed
}

/**
 * One short pop once the answer is known (when the spotlight lands), falling over the spotlight end of the results
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
    const colors = CONFETTI_VARS.map((v, i) => style.getPropertyValue(v).trim() || CONFETTI_FALLBACK[i] || '#8c6a1f')
    const pieces = confetti(width < 600 ? 32 : 64, colors)
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

/** Dense ranks by count: the most chosen is 1, ties share a rank, and the fifth place and below share the stormy sky. */
function rankOf(results: Results, id: string): number {
  const mine = results.options.find((o) => o.id === id)?.count ?? 0
  const above = new Set(results.options.filter((o) => o.count > mine).map((o) => o.count))
  return Math.min(5, above.size + 1)
}

/**
 * The rank's numeral in a disc of its sky, inside a ring. For the winner and the right answer the brass ring draws
 * once the shares have run (the reveal's focal moment); for the others the ring stays a hairline.
 */
function Rank({ rank, drawn, delay, still, lang }: { rank: number; drawn: boolean; delay: number; still: boolean; lang: string }) {
  return (
    <span className="reveal__rank">
      <svg className="reveal__ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
        <circle className="reveal__ring-track" cx="20" cy="20" r="18.5" />
        {drawn ? (
          <motion.circle
            className="reveal__ring-run"
            cx="20"
            cy="20"
            r="18.5"
            pathLength={100}
            initial={still ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={still ? { duration: 0 } : { duration: dur.focal, ease: easeOut, delay }}
          />
        ) : null}
      </svg>
      <span className="reveal__rank-num">{new Intl.NumberFormat(lang).format(rank)}</span>
    </span>
  )
}

/**
 * The person who answered first (for a quiz, first right), with their character and time (spec 006 US5 #2), or for a
 * quiz nobody got right, a kind line (US6 #2) whatever the spotlight setting, since it names nobody.
 */
function Spotlight({ slide, results, text, delay, still }: { slide: QuestionSlide; results: Results; text: string | null; delay: number; still: boolean }) {
  const { t } = useTranslation()
  const quiz = slide.kind === 'quiz'
  const first = results.first
  if (results.total === 0) return null
  const enter = {
    initial: still ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0 } : { ...spring.soft, delay },
  } as const
  if (quiz && !someoneRight(results)) {
    return <motion.p className="reveal__spotlight is-nobody" {...enter}>{t('present.reveal.nobodyRight')}</motion.p>
  }
  if (!slide.showFirst || !first || !text) return null
  return (
    <motion.section className="reveal__spotlight" aria-label={t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')} {...enter}>
      {isAnyCharacter(first.character) ? <Character id={first.character} ring={first.ring ?? 0} className="reveal__spotlight-char" /> : null}
      <p className="reveal__spotlight-text">
        <span className="reveal__spotlight-label">{t(quiz ? 'present.reveal.firstRight' : 'present.reveal.fastest')}</span>
        <span className="reveal__spotlight-who">{text}</span>
      </p>
    </motion.section>
  )
}

/**
 * Revealed results (spec 006 US5): rows rise one after another, shares run along their tracks while the figures count
 * up in step, every option carries its rank as a numeral in its sky, the most chosen options of a poll carry a crown
 * and a label, a quiz marks its right answer with an icon and a label (never colour alone), then the winner's brass
 * ring draws, the spotlight lands and the confetti pops once. Screen readers get a table and one announcement with the
 * marks and the spotlight. Under reduced motion everything shows at once, without confetti.
 * Only the reveal this page saw happen plays (animate); coming back to it, unblanking or reloading shows the stored
 * results still and silent.
 */
export function Reveal({ slide, results, mine, animate }: { slide: QuestionSlide; results: Results; mine?: string[]; animate: boolean }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const reducedMotion = useReducedMotion()
  const [still] = useState(() => !animate || reducedMotion)
  const total = REVEAL_MS + STAGGER_MS * Math.max(0, slide.options.length - 1)
  const elapsed = useElapsed(total, still)
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
  const party = !still && (!quiz || someoneRight(results))
  // The rows rise first (stagger capped at 240 ms), the ring draws as the last share lands, then the spotlight.
  const rows: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: spring.soft },
  }
  const ringDelay = total / 1000
  const spotlightDelay = ringDelay + 0.15

  return (
    <div className={['reveal', still ? 'is-still' : ''].filter(Boolean).join(' ')} style={{ '--reveal-ms': `${REVEAL_MS}ms`, '--stagger-ms': `${STAGGER_MS}ms` } as CSSProperties}>
      {party ? <Confetti delay={total + 150} /> : null}
      <motion.ol className="reveal__options" aria-hidden="true" variants={listVariants(still, 0.04)} initial={still ? false : 'hidden'} animate="show">
        {slide.options.map((o, i) => {
          const r = results.options.find((x) => x.id === o.id)
          if (!r) return null
          const local = elapsed - i * STAGGER_MS
          const rank = rankOf(results, o.id)
          return (
            <motion.li key={o.id} variants={rows}
              className={['reveal__option', r.winner ? 'is-winner' : '', r.correct ? 'is-correct' : '', mine?.includes(o.id) ? 'is-mine' : ''].filter(Boolean).join(' ')}
              data-rank={rank}
              style={{ '--share': `${r.percent}%`, '--i': i } as CSSProperties}>
              <Rank rank={rank} drawn={!!(r.winner || r.correct)} delay={ringDelay} still={still} lang={lang} />
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
              <span className="reveal__track">
                <span className="reveal__bar" />
              </span>
            </motion.li>
          )
        })}
      </motion.ol>
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
      <Spotlight slide={slide} results={results} text={who} delay={spotlightDelay} still={still} />
    </div>
  )
}
