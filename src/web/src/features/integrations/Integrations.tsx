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
      {LOGOS[provider].map((l) => <img key={l} src={`/brands/${l}.svg`} alt="" width="44" height="44" />)}
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

/** One service as a row: the brand mark at 44px, the name, what it does, the status lozenge, then its actions. */
function Service({ view }: { view: IntegrationView }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const disconnect = useDisconnect(view.provider)
  const test = useTestConnection(view.provider)
  const titleId = useId()
  return (
    <li className={`svc${view.connected ? ' is-live' : ''}`} aria-labelledby={titleId}>
      <div className="svc__top">
        <Logos provider={view.provider} />
        <div className="svc__copy">
          <div className="svc__title">
            <h2 id={titleId} className="svc__name" lang="en" dir="ltr">{t(`integrations.${view.provider}.name`)}</h2>
            <span className={`lozenge ${view.connected ? 'lozenge--success' : 'lozenge--neutral'}`}>
              {view.connected ? t('integrations.connected') : t('integrations.notConnected')}
            </span>
          </div>
          <p className="svc__what">{t(`integrations.${view.provider}.what`)}</p>
        </div>
        {!view.connected && !editing ? (
          <div className="svc__actions svc__actions--end">
            <Button variant="default" icon={<Plug size={16} />} onClick={() => setEditing(true)}>{t('integrations.connect')}</Button>
          </div>
        ) : null}
      </div>
      {view.connected && !editing ? (
        <div className="svc__status">
          <p className="svc__hint" dir="ltr">{view.hint}</p>
          {view.lastUsedAt ? (
            <p className="svc__meta">{t('integrations.lastUsed', { date: new Date(view.lastUsedAt).toLocaleString(i18n.language) })}</p>
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
      ) : null}
    </li>
  )
}

/**
 * Connect the services your team already uses; circles can then send their results there.
 * The connected ones sit together in the page's one dark card; the rest are outlined rows under it.
 */
export default function Integrations() {
  const { t } = useTranslation()
  useDocumentTitle('integrations.title')
  const list = useIntegrations()
  if (list.isPending) return <Loading />
  const views = PROVIDERS.map((p) => list.data?.find((v) => v.provider === p) ?? { provider: p, connected: false, hint: null, lastUsedAt: null })
  const live = views.filter((v) => v.connected)
  const rest = views.filter((v) => !v.connected)
  return (
    <div className="page">
      <PageHeader crumbs={[{ to: '/app', label: t('common.nav.home') }]} title={t('integrations.title')} lead={t('integrations.lead')} />
      {list.isError ? <p className="field__error" role="alert">{t('common.errorGeneric')}</p> : null}
      <div className="svc-grid" data-perch="services">
        {live.length > 0 ? (
          <section className="panel panel--dark svc-live" aria-labelledby="svc-live-title">
            <div className="panel__head">
              <h2 id="svc-live-title" className="panel__title">{t('integrations.connectedTitle')}</h2>
            </div>
            <ul className="panel__body svc-list">
              {live.map((v) => <Service key={v.provider} view={v} />)}
            </ul>
          </section>
        ) : null}
        <ul className="svc-list">
          {rest.map((v) => <Service key={v.provider} view={v} />)}
          <li className="svc svc--soon" aria-labelledby="svc-salesforce">
            <div className="svc__top">
              <Logos provider="salesforce" />
              <div className="svc__copy">
                <div className="svc__title">
                  <h2 id="svc-salesforce" className="svc__name" lang="en" dir="ltr">Salesforce</h2>
                  <span className="lozenge lozenge--neutral">{t('common.soon')}</span>
                </div>
                <p className="svc__what">{t('landing.integrations.items.salesforce')}</p>
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}
