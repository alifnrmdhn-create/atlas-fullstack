import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

export interface TooltipProps {
  /** Popover body — short definition, formula, or exact value. Keep it terse. */
  content: ReactNode
  children: ReactNode
  /** Preferred side; auto-flips if there isn't room. */
  side?: 'top' | 'bottom'
  className?: string
}

type Pos = { top: number; left: number; placement: 'top' | 'bottom' }

/**
 * Tooltip — hover/focus popover, rendered to a body portal with fixed
 * positioning so it never clips behind the topbar or an overflow ancestor.
 * Auto-flips up/down based on available space and clamps to the viewport.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  const show = useCallback(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const placement: 'top' | 'bottom' = side === 'bottom'
      ? (vh - r.bottom > 140 ? 'bottom' : 'top')
      : (r.top > 140 ? 'top' : 'bottom')
    setPos({
      top: placement === 'top' ? r.top - 8 : r.bottom + 8,
      left: Math.min(Math.max(r.left + r.width / 2, 150), vw - 150),
      placement,
    })
  }, [side])

  const hide = useCallback(() => setPos(null), [])

  // Pointer-aware: mouse → hover; touch/pen → tap-toggle (tak ada state hover di
  // touch, jadi hover-only bikin tooltip mustahil dibuka). Keyboard → focus/blur.
  const onPointerEnter = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') show()
  }, [show])
  const onPointerLeave = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') hide()
  }, [hide])
  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return
    e.preventDefault() // cegah focus/scroll sekuel di sebagian browser touch
    if (pos) hide(); else show()
  }, [pos, show, hide])

  // Saat terbuka via tap, tutup kalau user tap di luar pemicu (bubble = teks saja).
  useEffect(() => {
    if (!pos) return
    const onDocDown = (ev: PointerEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) hide()
    }
    document.addEventListener('pointerdown', onDocDown)
    return () => document.removeEventListener('pointerdown', onDocDown)
  }, [pos, hide])

  return (
    <span
      ref={ref}
      className={['ds-tip', className].filter(Boolean).join(' ')}
      tabIndex={0}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <span
          className="ds-tip__bubble"
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: pos.placement === 'top'
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
          }}
        >
          {content}
        </span>,
        document.body,
      )}
    </span>
  )
}
