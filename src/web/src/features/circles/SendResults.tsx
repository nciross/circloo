import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ExternalLink, Send } from 'lucide-react'
import { ApiError } from '../../api/client'
import { LOGOS, useExport, useIntegrations, type Provider } from '../../api/integrations'
import { usePopover } from '../../components/usePopover'
import { ACTIVITIES } from './catalog'

/** Animator: send what the circle produced to a connected service, then open it there. */
export function SendResults({ circleId }: { circleId: string }) {
  const { t } = useTranslation()
  const { open, toggle, close, triggerRef, panelRef, panelProps } = usePopover()
  const list = useIntegrations()
  const send = useExport(circleId)
  const [result, setResult] = useState<{ provider: Provider; url: string | null; created: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const connected = (list.data ?? []).filter((v) => v.connected)

  const go = async (provider: Provider) => {
    close()
    setError(null)
    setResult(null)
    const titles = Object.fromEntries(ACTIVITIES.map((a) => [a.id, t(`activities.${a.id}.title`)]))
    try {
      const r = await send.mutateAsync({ provider, titles })
      setResult({ provider, ...r })
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? t('circles.errors.slowDown') : t('integrations.sendFailed', { name: t(`integrations.${provider}.name`) }))
    }
  }

  return (
    <div className="dropdown send">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn--default btn--md"
        aria-expanded={open}
        aria-controls={id}
        aria-busy={send.isPending || undefined}
        onClick={toggle}
      >
        <span className="btn__icon" aria-hidden="true"><Send size={16} /></span>
        <span className="btn__label">{send.isPending ? t('integrations.sending') : t('integrations.send')}</span>
      </button>
      <div ref={panelRef} id={id} className="dropdown__panel dropdown__panel--end send__panel" hidden={!open} {...panelProps}>
        {connected.length === 0 ? (
          <div className="send__empty">
            <p className="field__help">{t('integrations.noneConnected')}</p>
            <Link to="/app/integrations" onClick={() => close(false)}>{t('integrations.title')}</Link>
          </div>
        ) : (
          <ul className="dropdown__list">
            {connected.map((v) => (
              <li key={v.provider}>
                <button type="button" className="dropdown__item" onClick={() => void go(v.provider)}>
                  <span className="send__logos" aria-hidden="true">
                    {LOGOS[v.provider].slice(0, 1).map((l) => <img key={l} src={`/brands/${l}.svg`} alt="" width="20" height="20" />)}
                  </span>
                  <span className="dropdown__item-text">{t(`integrations.${v.provider}.sendTo`)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="send__status" role="status">
        {result ? (
          <>
            {t('integrations.sent', { name: t(`integrations.${result.provider}.name`), count: result.created })}{' '}
            {result.url ? (
              <a href={result.url} target="_blank" rel="noopener noreferrer">
                {t('integrations.open')} <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
          </>
        ) : null}
      </p>
      {error ? <p className="field__error send__status" role="alert">{error}</p> : null}
    </div>
  )
}
