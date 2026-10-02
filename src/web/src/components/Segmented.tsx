import type { ReactNode } from 'react'

export interface Choice<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  lang?: string
  ariaLabel?: string
}

/**
 * A single-choice segmented control. Toggle buttons with aria-pressed that apply on activation,
 * so moving focus never changes anything (WCAG 3.2.2).
 */
export function Segmented<T extends string>({
  label,
  choices,
  value,
  onChange,
  hideLabel = false,
  className,
  describedBy,
}: {
  label: string
  choices: Choice<T>[]
  value: T
  onChange: (value: T) => void
  hideLabel?: boolean
  className?: string
  describedBy?: string
}) {
  return (
    <div className={['seg', className].filter(Boolean).join(' ')} role="group" aria-label={label} aria-describedby={describedBy}>
      {hideLabel ? null : <span className="seg__label" aria-hidden="true">{label}</span>}
      <div className="seg__track">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            className="seg__opt"
            lang={c.lang}
            aria-label={c.ariaLabel}
            aria-pressed={value === c.value}
            onClick={() => onChange(c.value)}
          >
            {c.icon ? <span className="seg__icon" aria-hidden="true">{c.icon}</span> : null}
            {c.ariaLabel ? <span aria-hidden="true">{c.label}</span> : c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
