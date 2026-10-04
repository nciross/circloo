import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useSecondsLeft } from './useSecondsLeft'

/**
 * A quiz countdown: the seconds in large figures and a bar that empties. It is a timer screen readers can query at any
 * moment; it speaks on its own only at 10 and 5 seconds, and when time is up unless the screen already says so.
 */
export function Countdown({ deadline, total, announceEnd = true, className }: { deadline: string; total: number; announceEnd?: boolean; className?: string }) {
  const { t } = useTranslation()
  const left = useSecondsLeft(deadline) ?? 0
  const spoken = left === 10 || left === 5 ? t('present.secondsLeft', { count: left }) : left === 0 && announceEnd ? t('present.timeUp') : ''
  return (
    <div className={['countdown', left <= 5 ? 'is-ending' : '', className].filter(Boolean).join(' ')}
      style={{ '--left': `${total > 0 ? Math.min(100, (left / total) * 100) : 0}%` } as CSSProperties}>
      <p className="countdown__time" role="timer" aria-label={t('present.secondsLeft', { count: left })}><bdi aria-hidden="true">{left}</bdi></p>
      <span className="countdown__bar" aria-hidden="true" />
      <p className="visually-hidden" aria-live="polite">{spoken}</p>
    </div>
  )
}
