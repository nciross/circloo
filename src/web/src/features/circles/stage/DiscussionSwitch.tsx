import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hubCode } from '../room'
import { useStage } from './stage'

/**
 * The animator's Live discussion switch (spec 009 US1, T906): off by default, with "Allow cameras" (on by default; off means
 * audio and chat only). The server enforces who may change it; this only asks.
 */
export function DiscussionSwitch() {
  const { t } = useTranslation()
  const discussion = useStage((s) => s.discussion)
  const enable = useStage((s) => s.enableDiscussion)
  const disable = useStage((s) => s.disableDiscussion)
  const on = discussion?.on ?? false
  // While it is off the choice waits here (starting from the circle's last setting) and goes with the switch.
  const [cameras, setCameras] = useState<boolean | null>(null)
  const videoAllowed = on ? (discussion?.videoAllowed ?? true) : (cameras ?? discussion?.videoAllowed ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const helpId = useId()
  const camId = useId()

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      const code = hubCode(e)
      setError(t(`circles.call.errors.${code}`, { defaultValue: t('circles.call.errors.failed') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="call__switch">
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={on}
        aria-busy={busy || undefined}
        aria-describedby={helpId}
        onClick={() => void run(() => (on ? disable() : enable(videoAllowed)))}
      >
        <span className="switch__track" aria-hidden="true"><span className="switch__knob" /></span>
        {t('circles.call.switch')}
      </button>
      <p id={helpId} className="field__help">{t('circles.call.switchHelp')}</p>
      <label className="call__check" htmlFor={camId}>
        <input
          id={camId}
          type="checkbox"
          checked={videoAllowed}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked
            setCameras(next)
            // Calling it again while on changes only the camera rule (contracts/hub.md).
            if (on) void run(() => enable(next))
          }}
        />
        <span>{t('circles.call.cameras')}</span>
      </label>
      <p className="field__help call__check-help">{t('circles.call.camerasHelp')}</p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </div>
  )
}
