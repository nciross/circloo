import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

export type MagnetColor = 'tomato' | 'cobalt' | 'sunflower' | 'ink' | 'paper'

const cls = (color: MagnetColor, size: 'md' | 'lg' | 'sm', extra?: string) =>
  ['magnet', `magnet--${color}`, `magnet--${size}`, extra].filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: MagnetColor
  size?: 'md' | 'lg' | 'sm'
  icon?: ReactNode
  busy?: boolean
}

/** A button that is a fridge magnet: it sits proud of the door and snaps flat when pressed. */
export function MagnetButton({ color = 'tomato', size = 'md', icon, busy, className, children, disabled, onClick, ...rest }: ButtonProps) {
  // While busy the button stays focusable (aria-disabled) so keyboard focus is never dropped to <body>.
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      className={cls(color, size, className)}
    >
      {icon ? <span className="magnet__icon" aria-hidden="true">{icon}</span> : null}
      <span className="magnet__label">{children}</span>
    </button>
  )
}

type LinkMagnetProps = LinkProps & { color?: MagnetColor; size?: 'md' | 'lg' | 'sm'; icon?: ReactNode }

export function MagnetLink({ color = 'tomato', size = 'md', icon, className, children, ...rest }: LinkMagnetProps) {
  return (
    <Link {...rest} className={cls(color, size, typeof className === 'string' ? className : undefined)}>
      {icon ? <span className="magnet__icon" aria-hidden="true">{icon}</span> : null}
      <span className="magnet__label">{children as ReactNode}</span>
    </Link>
  )
}
