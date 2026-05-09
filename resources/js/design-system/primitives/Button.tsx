import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import './Button.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', iconLeft, iconRight, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = ['ds-button', `ds-button--${variant}`, `ds-button--${size}`, className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {iconLeft ? <span className="ds-button__icon">{iconLeft}</span> : null}
      {children ? <span className="ds-button__label">{children}</span> : null}
      {iconRight ? <span className="ds-button__icon">{iconRight}</span> : null}
    </button>
  )
})
