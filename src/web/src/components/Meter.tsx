import { useTranslation } from 'react-i18next'

export type MeterTone = 'ok' | 'mid' | 'low' | 'ink' | 'beam'

/** Which tone a share deserves: full or nearly is ok, half is mid, little or nothing is low. */
export const toneFor = (value: number, max: number): MeterTone => {
  if (max <= 0) return 'low'
  const share = value / max
  return share >= 0.7 ? 'ok' : share >= 0.3 ? 'mid' : 'low'
}

/**
 * The meter: ten segments, always (charte graphique, buddy list). Anything counted becomes a bar: today's
 * check-ins, votes, a round's time. The number is said in words next to it; the bar itself is decorative.
 */
export function Meter({ value, max, tone, size, className, label }: {
  value: number
  max: number
  /** Defaults to the share's tone. */
  tone?: MeterTone
  size?: 'sm'
  className?: string
  /** A readable name for the bar; without one the bar is hidden from screen readers. */
  label?: string
}) {
  const { t } = useTranslation()
  const on = max > 0 ? Math.round(Math.min(1, Math.max(0, value / max)) * 10) : 0
  const lit = value > 0 && on === 0 ? 1 : on
  const cls = ['meter', `meter--${tone ?? toneFor(value, max)}`, size ? `meter--${size}` : null, className].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      role={label ? 'meter' : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? max : undefined}
      aria-valuenow={label ? value : undefined}
      aria-valuetext={label ? t('common.meterOf', { value, max }) : undefined}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`meter__seg${i < lit ? ' is-on' : ''}`} />
      ))}
    </div>
  )
}
