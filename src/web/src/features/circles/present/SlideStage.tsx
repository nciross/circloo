import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import { ListChecks, Vote } from 'lucide-react'
import { Meter } from '../../../components/Meter'
import { dur, easeOut, useReducedMotion } from '../../../lib/motion'
import { isRevealed, useLive, type PresentationState, type QuestionSlide, type Results } from './presentation'
import { Reveal } from './Reveal'

/** An option's share: count and percent at the end of the line, a small meter of its votes under it. */
export function Share({ results, id }: { results: Results | null | undefined; id: string }) {
  const { t } = useTranslation()
  const share = results?.options.find((o) => o.id === id)
  if (!share || !results) return null
  return (
    <span className="share">
      <span className="share__figures">{t('present.share', { percent: share.percent, count: share.count })}</span>
      <Meter size="sm" tone="ink" value={share.count} max={results.total} className="share__meter" />
    </span>
  )
}

/** The question in display scale, its kind under it, as the stage and the answer pad both show them. */
export function QuestionHead({ slide }: { slide: QuestionSlide }) {
  const { t } = useTranslation()
  return (
    <div className="stage-slide__head">
      <p className="stage-slide__title" dir="auto">{slide.question}</p>
      <p className="stage-slide__kind">
        {slide.kind === 'quiz' ? <ListChecks size={18} aria-hidden="true" /> : <Vote size={18} aria-hidden="true" />}
        {t(slide.kind === 'quiz' ? 'present.quiz' : 'present.poll')}
      </p>
    </div>
  )
}

/**
 * The current slide as everyone sees it: a deck picture fitted to the width (never mirrored, even in RTL), a question
 * card that grows to fit its answers on small screens, or a calm blank screen. Here a question is read only, with its
 * live results when the poll shows them; participants answer on the answer pad.
 * A slide change cross-fades with an 8px shift along the reading direction; the leaving slide goes faster than the
 * arriving one, and under reduced motion only the fade remains.
 */
export function SlideStage({ state, className, children }: { state: PresentationState; className?: string; children?: ReactNode }) {
  const { t, i18n } = useTranslation()
  const reduced = useReducedMotion()
  const label = t('present.slideAlt', { n: state.position + 1, total: state.count })
  const slide = state.slide
  const revealedLive = useLive((s) => s.revealedLive)
  const question = slide.kind !== 'deck'
  const shift = reduced ? 0 : i18n.dir() === 'rtl' ? -8 : 8
  const key = state.blank ? 'blank' : slide.slideId
  return (
    <div className={['stage-slide', state.blank ? 'is-blank' : '', question && !state.blank ? 'is-question' : '', className].filter(Boolean).join(' ')}
      data-position={state.position}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          className="stage-slide__slide"
          initial={{ x: shift }}
          animate={{ opacity: 1, x: 0, transition: { duration: dur.enter, ease: easeOut } }}
          exit={{ opacity: 0, x: -shift, transition: { duration: dur.state, ease: easeOut } }}
        >
          {state.blank ? (
            <div className="stage-slide__blank" role="status">
              <p>{t('present.blankTitle')}</p>
            </div>
          ) : slide.kind === 'deck' ? (
            <img className="stage-slide__image" src={slide.image} alt={label} width={1920} height={1080} decoding="async" />
          ) : (
            <section className="stage-slide__question" aria-label={label}>
              <QuestionHead slide={slide} />
              {isRevealed(state) && state.results ? (
                <Reveal key={slide.slideId} slide={slide} results={state.results} animate={revealedLive === slide.slideId} />
              ) : (
                <ol className={['stage-slide__options', state.results ? 'has-results' : ''].filter(Boolean).join(' ')}>
                  {slide.options.map((o, i) => (
                    <li key={o.id}>
                      <span className="stage-slide__letter" aria-hidden="true">{i + 1}</span>
                      <span className="stage-slide__text" dir="auto">{o.text}</span>
                      <Share results={state.results} id={o.id} />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </motion.div>
      </AnimatePresence>
      {children}
    </div>
  )
}
