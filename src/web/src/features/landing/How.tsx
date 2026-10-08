import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

const STEPS: { id: string; href: string }[] = [
  { id: 'say', href: '/signin' },
  { id: 'share', href: '#story-circle' },
  { id: 'play', href: '#rounds' },
]

/** Dotted threads between the three cards, drawn over the board at desktop widths (the board is 1000 × 420). */
const Wire = () => (
  <svg className="how__wire" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M305 90 C 400 90 440 30 500 70 S 600 150 695 135" />
    <path d="M850 240 C 870 310 760 340 655 300" />
    <path d="M150 180 C 150 270 260 240 345 320" />
  </svg>
)

/**
 * "How it works": three numbered cards. Phones read them down one dotted thread; wide screens lay them on a zig-zag
 * joined by curved dotted lines, with one handwritten aside.
 */
export function How() {
  const { t } = useTranslation()
  return (
    <section id="how" className="strip how" aria-labelledby="how-title">
      <h2 id="how-title" className="section-title section-title--center">{t('landing.how.title')}</h2>
      <div className="how__board">
        <Wire />
        {STEPS.map((s, i) => {
          return (
            <article key={s.id} className={`step step--${i + 1}`} aria-labelledby={`step-${s.id}`}>
              <span className="step__num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3 id={`step-${s.id}`} className="step__title">{t(`landing.how.steps.${s.id}.title`)}</h3>
              <p className="step__body">{t(`landing.how.steps.${s.id}.body`)}</p>
              {s.href.startsWith('/')
                ? <Link to={s.href} className="step__link" viewTransition>{t(`landing.how.steps.${s.id}.link`)}</Link>
                : <a href={s.href} className="step__link">{t(`landing.how.steps.${s.id}.link`)}</a>}
            </article>
          )
        })}
        <p className="hand hand--pink how__note">{t('landing.how.note')}</p>
      </div>
    </section>
  )
}
