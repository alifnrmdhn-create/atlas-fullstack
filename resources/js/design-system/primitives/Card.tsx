import type { HTMLAttributes, ReactNode } from 'react'
import './Card.css'

type Padding = 'none' | 'sm' | 'md' | 'lg'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding
  /** Use sunken for nested panels; default is flat with hairline border. */
  variant?: 'default' | 'sunken'
}

export function Card({ padding = 'md', variant = 'default', className, children, ...rest }: CardProps) {
  const cls = ['ds-card', `ds-card--${variant}`, `ds-card--p-${padding}`, className].filter(Boolean).join(' ')
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['ds-card__header', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={['ds-card__title', className].filter(Boolean).join(' ')}>{children}</h3>
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={['ds-card__description', className].filter(Boolean).join(' ')}>{children}</p>
}
