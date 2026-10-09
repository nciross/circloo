import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hubCode } from '../room'

/**
 * Runs one hands action at a time and turns the hub's refusal into a sentence (`circles.hands.errors.*`): a hand that is
 * already down, the call bar's rate limit (`slow-down`), two animator tabs racing (`try-again`), being offline.
 * `onError` (optional) hears the same sentence, or null when the next action starts.
 */
export function useHandAction(onError?: (message: string | null) => void) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const running = useRef(false)
  const run = useCallback(
    async (key: string, action: () => Promise<void>) => {
      if (running.current) return
      running.current = true
      setBusy(key)
      setError(null)
      onError?.(null)
      try {
        await action()
      } catch (e) {
        const message = t(`circles.hands.errors.${hubCode(e)}`, { defaultValue: t('circles.hands.errors.failed') })
        setError(message)
        onError?.(message)
      } finally {
        running.current = false
        setBusy(null)
      }
    },
    [t, onError],
  )
  return { busy, error, run }
}
