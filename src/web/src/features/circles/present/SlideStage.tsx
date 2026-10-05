import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecks, Vote } from 'lucide-react'
import { isRevealed, useLive, type PresentationState, type QuestionSlide, type Results } from './presentation'
import { Reveal } from './Reveal'

/** An option's share as a bar behind it, with count and percent at the end of the line. */
export function Share({ results, id }: { results: Results | null | undefined; id: string }) {
  const { t } = useTranslation()
  const share = results?.options.find((o) => o.id === id)
  if (!share) return null
  return (
    <span className="share" style={{ '--share': `${share.percent}%` } as CSSProperties}>
      <span className="share__bar" aria-hidden="true" />
      <span className="share__figures">{t('present.share', { percent: share.percent, count: share.count })}</span>
    </span>
  )
}

/** The question and its kind, as the stage and the answer pad both show them. */
export function QuestionHead({ slide }: { slide: QuestionSlide }) {
  const { t } = useTranslation()
  return (
    <>
      <p className="stage-slide__kind">
        {slide.kind === 'quiz' ? <ListChecks size={18} aria-hidden="true" /> : <Vote size={18} aria-hidden="true" />}
        {t(slide.kind === 'quiz' ? 'present.quiz' : 'present.poll')}
      </p>
      <p className="stage-slide__title" dir="auto">{slide.question}</p>
    </>
  )
}

/**
 * The current slide as everyone sees it: a deck picture fitted to the width (never mirrored, even in RTL), a question
 * card that grows to fit its answers on small screens, or a calm blank screen. Here a question is read only, with its
 * live results when the poll shows them; participants answer on the answer pad.
 */
export function SlideStage({ state, className, children }: { state: PresentationState; className?: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const label = t('present.slideAlt', { n: state.position + 1, total: state.count })
  const slide = state.slide
  const revealedLive = useLive((s) => s.revealedLive)
  const question = slide.kind !== 'deck'
  return (
    <div className={['stage-slide', state.blank ? 'is-blank' : '', question && !state.blank ? 'is-question' : '', className].filter(Boolean).join(' ')}
      data-position={state.position}>
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
      {children}
    </div>
  )
}
