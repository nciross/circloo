import { useTranslation } from 'react-i18next'
import { QuoteMark, Star } from './Doodles'

const LANGS = ['en', 'fr', 'ar', 'es'] as const
const TONE: Record<(typeof LANGS)[number], string> = { en: 'mint', fr: 'sky', ar: 'peach', es: 'butter' }

/** "Icebreakers in four languages": one card per language with a real seed question set in that language. */
export function Samples() {
  const { t } = useTranslation()
  return (
    <section id="samples" className="strip samples" aria-labelledby="samples-title">
      <div className="strip__head">
        <h2 id="samples-title" className="section-title">{t('landing.samples.title')}</h2>
      </div>
      <ul className="samples__grid">
        {LANGS.map((l) => (
          <li key={l}>
            <article className="sample" aria-label={t(`landing.samples.in.${l}`)}>
              <blockquote className={`sample__cover sample__cover--${TONE[l]}`} lang={l} dir={l === 'ar' ? 'rtl' : 'ltr'}>
                <QuoteMark className="sample__quote" />
                <p>{t(`landing.samples.texts.${l}`)}</p>
              </blockquote>
              <span className="sample__in" lang={l} dir={l === 'ar' ? 'rtl' : 'ltr'}>{t(`landing.samples.in.${l}`)}</span>
              <h3 className="sample__title">{t('landing.samples.kind')}</h3>
              <p className="sample__meta">{t('landing.samples.meta')}</p>
            </article>
          </li>
        ))}
      </ul>
      <p className="hand hand--pink samples__note">
        <Star className="samples__star" />
        <span>{t('landing.samples.note')}</span>
      </p>
    </section>
  )
}
