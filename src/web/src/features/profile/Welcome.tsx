import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { useMe, useUpdateProfile } from '../../api/hooks'
import { safeReturnTo } from '../../lib/returnTo'
import { NAME_MAX, validName } from '../../lib/forms'
import { useDocumentTitle } from '../../app/locale'
import { Freezer } from '../../components/Freezer'
import { LanguageMagnets } from '../../components/LanguageMagnets'
import { MagnetButton } from '../../components/Magnet'
import { useUiStore } from '../../stores/ui'
import type { Locale } from '../../i18n'
import '../../styles/app.css'

export default function Welcome() {
  const { t } = useTranslation()
  useDocumentTitle('welcome.title')
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const uiLocale = useUiStore((s) => s.locale)
  const chooseLocale = useUiStore((s) => s.chooseLocale)
  const update = useUpdateProfile()
  const [name, setName] = useState(me?.displayName ?? '')
  const [locale, setLocale] = useState<Locale>(uiLocale)
  const [error, setError] = useState<string | null>(null)
  const helpId = useId()
  const errorId = useId()

  const pickLocale = (l: Locale) => {
    setLocale(l)
    chooseLocale(l)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validName(name)) {
      setError(t('welcome.errors.name'))
      return
    }
    setError(null)
    try {
      await update.mutateAsync({ displayName: name.trim(), locale })
      navigate(safeReturnTo(params.get('returnTo')), { replace: true })
    } catch {
      setError(t('common.errorGeneric'))
    }
  }

  return (
    <div className="fridge">
      <Freezer homeTo="/app" showLanguages={false} />
      <main id="main" className="door door--center">
        <span className="door__handle" aria-hidden="true" />
        <form className="name-tag" onSubmit={submit} noValidate>
          <div className="name-tag__band">
            <h1 className="name-tag__title">{t('welcome.title')}</h1>
            <p className="name-tag__lead">{t('welcome.lead')}</p>
          </div>
          <div className="name-tag__body">
            <label className="field field--handwritten">
              <span className="visually-hidden">{t('welcome.nameLabel')}</span>
              <input
                name="displayName"
                autoComplete="nickname"
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('welcome.namePlaceholder')}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
                required
              />
            </label>
            <p id={helpId} className="field__help">{t('welcome.nameHelp')}</p>
            {error ? <p id={errorId} className="field__error" role="alert">{error}</p> : null}
            <div className="field">
              <span className="field__label" id="lang-label">{t('welcome.languageLabel')}</span>
              <LanguageMagnets value={locale} onChange={pickLocale} />
            </div>
            <MagnetButton type="submit" size="lg" busy={update.isPending}>
              {update.isPending ? t('welcome.saving') : t('welcome.submit')}
            </MagnetButton>
          </div>
        </form>
      </main>
    </div>
  )
}
