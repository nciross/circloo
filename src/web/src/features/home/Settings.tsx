import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useMe, useSignOutEverywhere, useUpdateProfile } from '../../api/hooks'
import { useDocumentTitle } from '../../app/locale'
import { LanguageMenu } from '../../components/LanguageMenu'
import { Segmented } from '../../components/Segmented'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/PageHeader'
import { useUiStore, type Theme } from '../../stores/ui'
import type { Locale } from '../../i18n'
import { NAME_MAX, validName } from '../../lib/forms'
import '../../styles/app.css'

export default function Settings() {
  const { t } = useTranslation()
  useDocumentTitle('settings.title')
  const navigate = useNavigate()
  const { data: me } = useMe()
  const { chooseLocale, theme, setTheme, autonomy, setAutonomy } = useUiStore()
  const update = useUpdateProfile()
  const everywhere = useSignOutEverywhere()
  const [name, setName] = useState(me?.displayName ?? '')
  const [locale, setLocale] = useState<Locale>(me?.locale ?? 'en')
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'invalid'>('idle')
  const [confirming, setConfirming] = useState(false)
  const [everywhereFailed, setEverywhereFailed] = useState(false)
  const statusId = useId()
  const nameId = useId()
  const langLabelId = useId()
  const autonomyHelp = useId()
  // Each theme previews its ground: bone by day, the dome by night, both for "match my device".
  const day = <span className="swatch swatch--day" />
  const night = <span className="swatch swatch--night" />

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
    <div className="page page--narrow">
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('settings.title')} />

      <form className="panel" onSubmit={save} noValidate aria-labelledby="profile-title">
        <div className="panel__head">
          <h2 id="profile-title" className="panel__title">{t('settings.profileTitle')}</h2>
        </div>
        <div className="panel__body form-grid">
          <label className="form-row" htmlFor={nameId}>
            <span className="form-row__label">{t('welcome.nameLabel')}</span>
          </label>
          <div className="form-row__control">
            <input
              id={nameId}
              className="input"
              name="displayName"
              maxLength={NAME_MAX}
              value={name}
              dir="auto"
              onChange={(e) => { setName(e.target.value); setStatus('idle') }}
              aria-invalid={status === 'invalid' || undefined}
              aria-describedby={statusId}
            />
          </div>
          <span className="form-row" id={langLabelId}>
            <span className="form-row__label">{t('welcome.languageLabel')}</span>
          </span>
          <div className="form-row__control">
            <LanguageMenu value={locale} onChange={(l) => { setLocale(l); setStatus('idle') }} labelledBy={langLabelId} align="start" />
          </div>
        </div>
        <div className="panel__actions">
          <p id={statusId} className={status === 'saved' ? 'field__ok' : 'field__error'} role="status">
            {status === 'saved' ? t('settings.saved') : status === 'invalid' ? t('welcome.errors.name') : status === 'error' ? t('common.errorGeneric') : ''}
          </p>
          <Button type="submit" busy={update.isPending}>{t('settings.save')}</Button>
        </div>
      </form>

      <section className="panel" aria-labelledby="appearance-title">
        <div className="panel__head">
          <h2 id="appearance-title" className="panel__title">{t('settings.appearanceTitle')}</h2>
        </div>
        <div className="panel__body">
          <Segmented<Theme>
            label={t('settings.themeLabel')}
            value={theme}
            onChange={setTheme}
            choices={[
              { value: 'system', label: t('settings.themes.system'), icon: <span className="swatch-pair">{day}{night}</span> },
              { value: 'light', label: t('settings.themes.light'), icon: day },
              { value: 'dark', label: t('settings.themes.dark'), icon: night },
            ]}
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="assistant-title">
        <div className="panel__head">
          <h2 id="assistant-title" className="panel__title">{t('settings.assistantTitle')}</h2>
        </div>
        <div className="panel__body">
          {/* Off or Suggest is a switch: nothing runs on its own either way. */}
          <div className="settings-switch">
            <button
              type="button"
              role="switch"
              className="switch"
              aria-checked={autonomy === 'suggest'}
              aria-describedby={autonomyHelp}
              onClick={() => setAutonomy(autonomy === 'suggest' ? 'off' : 'suggest')}
            >
              <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
              <span>{t('settings.autonomyLabel')}</span>
            </button>
            <p id={autonomyHelp} className="field__help">{t('settings.autonomyHelp')}</p>
          </div>
        </div>
      </section>

      <section className="panel settings-devices" aria-labelledby="devices">
        <div className="panel__head">
          <h2 id="devices" className="panel__title">{t('settings.sessionsTitle')}</h2>
        </div>
        <div className="panel__body">
          <p className="field__help">{t('settings.sessionsBody')}</p>
          {everywhereFailed ? <p className="field__error" role="alert">{t('settings.everywhereFailed')}</p> : null}
        </div>
        <div className="panel__actions">
          {confirming ? (
            <>
              <Button variant="subtle" onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                busy={everywhere.isPending}
                onClick={async () => {
                  setEverywhereFailed(false)
                  try {
                    await everywhere.mutateAsync()
                    navigate('/', { replace: true })
                  } catch {
                    setEverywhereFailed(true)
                  }
                }}
              >
                {t('settings.confirmEverywhere')}
              </Button>
            </>
          ) : (
            <Button variant="default" onClick={() => setConfirming(true)}>{t('common.signOutEverywhere')}</Button>
          )}
        </div>
      </section>
    </div>
  )
}
