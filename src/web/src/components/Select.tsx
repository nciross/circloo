import { useId } from 'react'
import { ChevronDown } from 'lucide-react'

/** A labelled native select: the platform picker on phones, full keyboard support everywhere. */
export function Select<T extends string>({
  label,
  name,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  name: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  const id = useId()
  return (
    <div className={['select', className].filter(Boolean).join(' ')}>
      <label htmlFor={id} className="select__label">{label}</label>
      <div className="select__box">
        <select id={id} name={name} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="select__chevron" size={16} aria-hidden="true" />
      </div>
    </div>
  )
}
