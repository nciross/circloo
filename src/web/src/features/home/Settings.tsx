import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMe, useSignOutEverywhere, useUpdateProfile } from '../../api/hooks'
import { useDocumentTitle } from '../../app/locale'
import { Freezer } from '../../components/Freezer'
import { LanguageMagnets } from '../../components/LanguageMagnets'
import { MagnetButton } from '../../components/Magnet'
import { useUiStore } from '../../stores/ui'
import type { Locale } from '../../i18n'
import { NAME_MAX, validName } from '../../lib/forms'
import { AccountMenu } from './AccountMenu'
import '../../styles/app.css'

export default function Settings() {
  const { t } = useTranslation()
  useDocumentTitle('settings.title')
  const navigate = useNavigate()
  const { data: me } = useMe()
  const chooseLocale = useUiStore((s) => s.chooseLocale)
  const update = useUpdateProfile()
  const everywhere = useSignOutEverywhere()
  const [name, setName] = useState(me?.displayName ?? '')
  const [locale, setLocale] = useState<Locale>(me?.locale ?? 'en')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'invalid'>('idle')
  const [confirming, setConfirming] = useState(false)
  const statusId = useId()

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!validName(name)) {
      setStatus('invalid')
      return
    }
    try {
      await update.mutateAsync({ displayName: name.trim(), locale })
      chooseLocale(locale)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="fridge">
      <Freezer homeTo="/app">
        <AccountMenu />
      </Freezer>
      <main id="main" className="door">
        <span className="door__handle" aria-hidden="true" />
        <h1 className="section-title door__panel">{t('settings.title')}</h1>
        <div className="door__panel settings-grid">
          <form className="sheet" onSubmit={save} noValidate aria-describedby={statusId}>
            <span className="pin-magnet pin-magnet--tomato" aria-hidden="true" />
            <h2 className="sheet__title">{t('settings.profileTitle')}</h2>
            <label className="field">
              <span className="field__label">{t('welcome.nameLabel')}</span>
              <input
                name="displayName"
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => { setName(e.target.value); setStatus('idle') }}
                aria-invalid={status === 'invalid' || undefined}
              />
            </label>
            <div className="field">
              <span className="field__label">{t('welcome.languageLabel')}</span>
              <LanguageMagnets value={locale} onChange={(l) => { setLocale(l); setStatus('idle') }} name="settings-language" />
            </div>
            <p id={statusId} className={status === 'saved' ? 'sheet__notice' : 'field__error'} role="status">
              {status === 'saved' ? t('settings.saved') : status === 'invalid' ? t('welcome.errors.name') : status === 'error' ? t('common.errorGeneric') : ''}
            </p>
            <MagnetButton type="submit" busy={update.isPending}>{t('settings.save')}</MagnetButton>
          </form>

          <section className="sheet sheet--quiet" aria-labelledby="devices">
            <h2 id="devices" className="sheet__title">{t('settings.sessionsTitle')}</h2>
            <p className="sheet__lead">{t('settings.sessionsBody')}</p>
            {confirming ? (
              <MagnetButton
                color="tomato"
                busy={everywhere.isPending}
                onClick={async () => {
                  await everywhere.mutateAsync().catch(() => undefined)
                  navigate('/', { replace: true })
                }}
              >
                {t('settings.confirmEverywhere')}
              </MagnetButton>
            ) : (
              <MagnetButton color="ink" onClick={() => setConfirming(true)}>{t('common.signOutEverywhere')}</MagnetButton>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
