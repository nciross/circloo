import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Video } from 'lucide-react'
import type { MediaKind } from './media'

/**
 * The one sentence before the browser asks for a device (spec 009 US4 #1, FR-910, T907). It sits in the call's bar, never
 * over the page: chat, hands and Leave stay where they are. Continue asks the browser; Not now and Escape ask nothing.
 * Focus lands on Continue, which carries the sentence as its description, and the caller puts it back on the device.
 */
export function PermissionPrimer({ kind, onContinue, onCancel }: { kind: MediaKind; onContinue: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const go = useRef<HTMLButtonElement>(null)
  useEffect(() => go.current?.focus(), [kind])
  const Icon = kind === 'audio' ? Mic : Video

  return (
    <div
      className="call-primer"
      role="group"
      aria-label={t(kind === 'audio' ? 'circles.call.mic' : 'circles.call.camera')}
      data-kind={kind}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onCancel()
      }}
    >
      <Icon size={20} aria-hidden="true" className="call-primer__icon" />
      <p id={id} className="call-primer__text">{t('circles.call.device.primer')}</p>
      <div className="call-primer__actions">
        <button ref={go} type="button" className="btn btn--primary" aria-describedby={id} onClick={onContinue}>
          {t('circles.call.device.continue')}
        </button>
        <button type="button" className="btn btn--subtle" onClick={onCancel}>{t('circles.call.device.notNow')}</button>
      </div>
    </div>
  )
}
