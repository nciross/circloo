import { useTranslation } from 'react-i18next'
import { MicOff, RotateCcw, VideoOff, X } from 'lucide-react'
import { browserFamily, type MediaProblem } from './media'
import type { DeviceProblem as Problem } from './stage'

/** Problems a second try can fix: a setting changed, a device plugged in, another app closed. */
const RETRY = new Set<MediaProblem>(['denied', 'no-device', 'busy'])

/**
 * Why a microphone or a camera did not start, in the call bar's status area (spec 009 US4 #2 to #6, T907): what
 * happened, what still works, how to allow it again when the browser blocks it (in this browser's own words), and Try
 * again when trying again can help. It stays until it is dismissed or the device is tried again, unlike the notices that
 * go by themselves. Give it `key={problem.id}` so a second failure is announced again.
 */
export function DeviceProblem({ problem, onRetry, onDismiss }: { problem: Problem; onRetry: () => void; onDismiss: () => void }) {
  const { t } = useTranslation()
  const { kind } = problem
  const Icon = kind === 'audio' ? MicOff : VideoOff
  const how = problem.problem === 'denied'
    ? t(`circles.call.device.allow.${browserFamily()}`, { device: t(`circles.call.device.what.${kind}`) })
    : null

  return (
    <div className="device-problem" data-problem={problem.problem} data-kind={kind}>
      <Icon size={20} aria-hidden="true" className="device-problem__icon" />
      <div className="device-problem__text" role="alert">
        <p className="device-problem__what">{t(`circles.call.device.${problem.problem}.${kind}`)}</p>
        {how ? <p className="device-problem__how">{how}</p> : null}
      </div>
      <div className="device-problem__actions">
        {RETRY.has(problem.problem) ? (
          <button type="button" className="btn btn--default device-problem__retry" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" />
            {t('circles.call.device.retry')}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn device-problem__close"
          aria-label={t('circles.call.device.dismiss')}
          title={t('circles.call.device.dismiss')}
          onClick={onDismiss}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
