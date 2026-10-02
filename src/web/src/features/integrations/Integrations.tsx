import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Plug, Unplug, XCircle } from 'lucide-react'
import { ApiError } from '../../api/client'
import { FIELDS, LOGOS, PROVIDERS, useConnect, useDisconnect, useIntegrations, useTestConnection, type IntegrationView, type Provider } from '../../api/integrations'
import { useDocumentTitle } from '../../app/locale'
import { Button } from '../../components/Button'
import { Loading } from '../../components/Loading'
import { PageHeader } from '../../components/PageHeader'
import '../../styles/app.css'
import '../../styles/integrations.css'


function Logos({ provider }: { provider: Provider | 'salesforce' }) {
  return (
    <span className="svc__logos" aria-hidden="true">
      {LOGOS[provider].map((l) => <img key={l} src={`/brands/${l}.svg`} alt="" width="36" height="36" />)}
    </span>
  )
}

function ConnectForm({ provider, onDone }: { provider: Provider; onDone: () => void }) {
  const { t } = useTranslation()
  const connect = useConnect(provider)
  const [values, setValues] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const base = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setFailed(false)
    try {
      await connect.mutateAsync(values)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.errors) {
        setErrors(Object.fromEntries(Object.keys(err.errors).map((k) => [k, t(`integrations.errors.${k}`, { defaultValue: t('common.errorGeneric') })])))
      } else setFailed(true)
    }
  }

  return (
    <form className="svc__form" onSubmit={submit} noValidate>
      <p className="field__help svc__how">{t(`integrations.${provider}.how`)}</p>
      {FIELDS[provider].map((f) => {
        const id = `${base}-${f.name}`
        return (
          <div key={f.name} className="field">
            <label className="field__label" htmlFor={id}>{t(`integrations.fields.${f.name}`)}</label>
            <input
              id={id}
              className="input"
              name={f.name}
              type={f.secret ? 'password' : (f.type ?? 'text')}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={values[f.name] ?? ''}
              placeholder={t(`integrations.placeholders.${f.name}`)}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              aria-invalid={errors[f.name] ? true : undefined}
              aria-describedby={errors[f.name] ? `${id}-err` : undefined}
            />
            {errors[f.name] ? <p id={`${id}-err`} className="field__error" role="alert">{errors[f.name]}</p> : null}
          </div>
        )
      })}
      {failed ? <p className="field__error" role="alert">{t('common.errorGeneric')}</p> : null}
      <p className="field__help">{t('integrations.secretNote')}</p>
      <div className="svc__actions">
        <Button variant="subtle" onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" busy={connect.isPending}>{t('integrations.save')}</Button>
      </div>
    </form>
  )
}

function Service({ view }: { view: IntegrationView }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const disconnect = useDisconnect(view.provider)
  const test = useTestConnection(view.provider)
  const titleId = useId()
  return (
    <li className="panel svc" aria-labelledby={titleId}>
      <div className="svc__top">
        <Logos provider={view.provider} />
        <div className="svc__copy">
          <div className="svc__title">
            <h2 id={titleId} className="panel__title" lang="en" dir="ltr">{t(`integrations.${view.provider}.name`)}</h2>
            <span className={`lozenge ${view.connected ? 'lozenge--success' : 'lozenge--neutral'}`}>
              {view.connected ? t('integrations.connected') : t('integrations.notConnected')}
            </span>
          </div>
          <p className="field__help">{t(`integrations.${view.provider}.what`)}</p>
        </div>
      </div>
      {view.connected && !editing ? (
        <div className="svc__status">
          <p className="svc__hint" dir="ltr">{view.hint}</p>
          {view.lastUsedAt ? (
            <p className="field__help">{t('integrations.lastUsed', { date: new Date(view.lastUsedAt).toLocaleString(i18n.language) })}</p>
          ) : null}
          <div className="svc__actions">
            <Button variant="default" size="sm" busy={test.isPending} onClick={() => test.mutate()}>{t(`integrations.${view.provider}.test`)}</Button>
            <Button variant="subtle" size="sm" onClick={() => setEditing(true)}>{t('integrations.edit')}</Button>
            <Button variant="subtle" size="sm" icon={<Unplug size={14} />} busy={disconnect.isPending} onClick={() => disconnect.mutate()}>{t('integrations.disconnect')}</Button>
          </div>
          <p className="svc__result" role="status">
            {test.data ? (
              test.data.ok
                ? <><CheckCircle2 size={16} aria-hidden="true" /> {t('integrations.testOk')}</>
                : <><XCircle size={16} aria-hidden="true" /> {t('integrations.testFailed', { status: test.data.status ?? '—' })}</>
            ) : null}
          </p>
        </div>
      ) : editing ? (
        <ConnectForm provider={view.provider} onDone={() => setEditing(false)} />
      ) : (
        <div className="svc__actions svc__actions--start">
          <Button variant="default" icon={<Plug size={16} />} onClick={() => setEditing(true)}>{t('integrations.connect')}</Button>
        </div>
      )}
    </li>
  )
}

/** Connect the services your team already uses; circles can then send their results there. */
export default function Integrations() {
  const { t } = useTranslation()
  useDocumentTitle('integrations.title')
  const list = useIntegrations()
  if (list.isPending) return <Loading />
  return (
    <div className="page">
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('integrations.title')} lead={t('integrations.lead')} />
      {list.isError ? <p className="field__error" role="alert">{t('common.errorGeneric')}</p> : null}
      <ul className="svc-grid" data-perch="services">
        {PROVIDERS.map((p) => <Service key={p} view={list.data?.find((v) => v.provider === p) ?? { provider: p, connected: false, hint: null, lastUsedAt: null }} />)}
        <li className="panel svc svc--soon" aria-labelledby="svc-salesforce">
          <div className="svc__top">
            <Logos provider="salesforce" />
            <div className="svc__copy">
              <div className="svc__title">
                <h2 id="svc-salesforce" className="panel__title" lang="en" dir="ltr">Salesforce</h2>
                <span className="lozenge lozenge--neutral">{t('common.soon')}</span>
              </div>
              <p className="field__help">{t('landing.integrations.items.salesforce')}</p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  )
}
