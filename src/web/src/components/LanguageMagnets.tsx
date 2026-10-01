import { useTranslation } from 'react-i18next'
import { LOCALES, type Locale } from '../i18n'
import { useUiStore } from '../stores/ui'
import { useChangeLocale } from '../app/locale'

/** Four letter magnets, one per language. A real radio group, so it works with keys and screen readers. */
export function LanguageMagnets({ value, onChange, name = 'language' }: { value?: Locale; onChange?: (l: Locale) => void; name?: string }) {
  const { t } = useTranslation()
  const current = useUiStore((s) => s.locale)
  const change = useChangeLocale()
  const selected = value ?? current
  const pick = onChange ?? change

  return (
    <fieldset className="lang-magnets">
      <legend className="visually-hidden">{t('common.language')}</legend>
      {LOCALES.map((l) => (
        <label key={l} className={`lang-magnet lang-magnet--${l}`} lang={l}>
          <input
            type="radio"
            name={name}
            value={l}
            checked={selected === l}
            onChange={() => pick(l)}
            className="visually-hidden"
          />
          <span className="lang-magnet__face" aria-hidden="true">{t(`common.languageShort.${l}`)}</span>
          <span className="visually-hidden">{t(`common.languages.${l}`)}</span>
        </label>
      ))}
    </fieldset>
  )
}
