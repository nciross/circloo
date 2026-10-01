import type { ReactNode } from 'react'

export interface Choice<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/**
 * A single-choice group of small magnets. Toggle buttons with aria-pressed that apply on activation,
 * like the language magnets, so focus moves never change anything (WCAG 3.2.2).
 */
export function ChoiceMagnets<T extends string>({
  label,
  choices,
  value,
  onChange,
  tone = 'cobalt',
  hideLabel = false,
}: {
  label: string
  choices: Choice<T>[]
  value: T
  onChange: (value: T) => void
  tone?: 'cobalt' | 'tomato' | 'sunflower' | 'ink'
  hideLabel?: boolean
}) {
  return (
    <div className={`choice-magnets choice-magnets--${tone}`} role="group" aria-label={label}>
      {hideLabel ? null : <span className="choice-magnets__label" aria-hidden="true">{label}</span>}
      <div className="choice-magnets__row">
        {choices.map((c) => (
          <button key={c.value} type="button" className="choice-magnet" aria-pressed={value === c.value} onClick={() => onChange(c.value)}>
            {c.icon ? <span className="choice-magnet__icon" aria-hidden="true">{c.icon}</span> : null}
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
