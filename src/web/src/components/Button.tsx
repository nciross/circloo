import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Link, type LinkProps } from 'react-router'

export type ButtonVariant = 'primary' | 'default' | 'subtle' | 'danger' | 'ai'
export type ButtonSize = 'sm' | 'md' | 'lg'

const cls = (variant: ButtonVariant, size: ButtonSize, extra?: string) =>
  ['btn', `btn--${variant}`, `btn--${size}`, extra].filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  busy?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'primary', size = 'md', icon, busy, className, children, onClick, ...rest }: ButtonProps) {
  // While busy the button stays focusable (aria-disabled) so keyboard focus is never dropped to <body>.
  return (
    <button
      type="button"
      {...rest}
      aria-disabled={busy || rest['aria-disabled'] || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      className={cls(variant, size, className)}
    >
      {icon ? <span className="btn__icon" aria-hidden="true">{icon}</span> : null}
      <span className="btn__label">{children}</span>
    </button>
  )
}

type ButtonLinkProps = LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }

export function ButtonLink({ variant = 'primary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link viewTransition {...rest} className={cls(variant, size, typeof className === 'string' ? className : undefined)}>
      {icon ? <span className="btn__icon" aria-hidden="true">{icon}</span> : null}
      <span className="btn__label">{children as ReactNode}</span>
    </Link>
  )
}
