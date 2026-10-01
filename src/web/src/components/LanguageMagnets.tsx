import { useTranslation } from 'react-i18next'
import { LOCALES, type Locale } from '../i18n'
import { useUiStore } from '../stores/ui'
import { useChangeLocale } from '../app/locale'

/**
 * Four letter magnets, one per language. Toggle buttons (aria-pressed) that apply only when
 * activated, so moving focus never flips the whole page (WCAG 3.2.2 On Input).
 */
export function LanguageMagnets({ value, onChange }: { value?: Locale; onChange?: (l: Locale) => void }) {
  const { t } = useTranslation()
  const current = useUiStore((s) => s.locale)
  const change = useChangeLocale()
  const selected = value ?? current
  const pick = onChange ?? change

  return (
    <div className="lang-magnets" role="group" aria-label={t('common.language')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-magnet lang-magnet--${l}`}
          lang={l}
          aria-pressed={selected === l}
          aria-label={t(`common.languages.${l}`)}
          onClick={() => pick(l)}
        >
          <span className="lang-magnet__face" aria-hidden="true">{t(`common.languageShort.${l}`)}</span>
        </button>
      ))}
    </div>
  )
}
