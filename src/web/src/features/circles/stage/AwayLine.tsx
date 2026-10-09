import { useTranslation } from 'react-i18next'
import { clock } from './away'

/**
 * No animator is connected: the call ends when the time runs out unless one comes back. The sentence is said once (a
 * status); the minutes and seconds tick in a timer, which screen readers leave alone.
 */
export function AwayLine({ left, announce, className }: { left: number; announce: boolean; className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={['call__away', className].filter(Boolean).join(' ')}>
      {/* In the call, the call's bar says it; said twice would be once too many. */}
      <span role={announce ? 'status' : undefined}>{t('circles.call.away')}</span>{' '}
      <span>{t('circles.call.awayEnds')}</span>{' '}
      <span role="timer" className="call__away-clock" dir="ltr">{clock(left)}</span>
    </p>
  )
}
