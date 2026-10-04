import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useSecondsLeft } from './useSecondsLeft'

/**
 * A quiz countdown: the seconds in large figures and a bar that empties. Screen readers hear it at 10 and 5 seconds
 * and when time is up, not every second.
 */
export function Countdown({ deadline, total, className }: { deadline: string; total: number; className?: string }) {
  const { t } = useTranslation()
  const left = useSecondsLeft(deadline) ?? 0
  const spoken = left === 10 || left === 5 ? t('present.secondsLeft', { count: left }) : left === 0 ? t('present.timeUp') : ''
  return (
    <div className={['countdown', left <= 5 ? 'is-ending' : '', className].filter(Boolean).join(' ')}
      style={{ '--left': `${total > 0 ? Math.min(100, (left / total) * 100) : 0}%` } as CSSProperties}>
      <p className="countdown__time" aria-hidden="true"><bdi>{left}</bdi></p>
      <span className="countdown__bar" aria-hidden="true" />
      <p className="visually-hidden" aria-live="polite">{spoken}</p>
    </div>
  )
}
