import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecks, Vote } from 'lucide-react'
import type { PresentationState } from './presentation'

/**
 * The current slide as everyone sees it: a deck picture fitted to the width (never mirrored, even in RTL), a question
 * card that grows to fit its answers on small screens, or a calm blank screen. Answering arrives with US4; here a
 * question is shown, read only.
 */
export function SlideStage({ state, className, children }: { state: PresentationState; className?: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const label = t('present.slideAlt', { n: state.position + 1, total: state.count })
  const slide = state.slide
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
          <p className="stage-slide__kind">
            {slide.kind === 'quiz' ? <ListChecks size={18} aria-hidden="true" /> : <Vote size={18} aria-hidden="true" />}
            {t(slide.kind === 'quiz' ? 'present.quiz' : 'present.poll')}
          </p>
          <p className="stage-slide__title" dir="auto">{slide.question}</p>
          <ol className="stage-slide__options">
            {slide.options.map((o, i) => (
              <li key={o.id}>
                <span className="stage-slide__letter" aria-hidden="true">{i + 1}</span>
                <span dir="auto">{o.text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {children}
    </div>
  )
}
