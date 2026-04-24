import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') return false
  if (element.tabIndex < 0) return false
  return element.getClientRects().length > 0
}

function collectFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusable)
}

function acquireBodyLock() {
  const body = document.body
  const html = document.documentElement
  const count = Number(body.dataset.dialogLockCount ?? '0')

  if (count === 0) {
    body.dataset.dialogLockBodyOverflow = body.style.overflow || ''
    body.dataset.dialogLockHtmlOverflow = html.style.overflow || ''
    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
  }

  body.dataset.dialogLockCount = String(count + 1)
}

function releaseBodyLock() {
  const body = document.body
  const html = document.documentElement
  const count = Number(body.dataset.dialogLockCount ?? '0')

  if (count <= 1) {
    body.style.overflow = body.dataset.dialogLockBodyOverflow ?? ''
    html.style.overflow = body.dataset.dialogLockHtmlOverflow ?? ''
    delete body.dataset.dialogLockCount
    delete body.dataset.dialogLockBodyOverflow
    delete body.dataset.dialogLockHtmlOverflow
    return
  }

  body.dataset.dialogLockCount = String(count - 1)
}

/**
 * Keeps keyboard focus inside an active dialog, restores previous focus on close,
 * and prevents background page scrolling while the dialog is open.
 */
export function useDialogFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    if (!active) return

    const root = ref.current
    if (!root) return

    acquireBodyLock()

    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const rafId = window.requestAnimationFrame(() => {
      const focusables = collectFocusable(root)
      const initialTarget = focusables[0] ?? root
      if (!root.contains(document.activeElement)) initialTarget.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusables = collectFocusable(root)
      if (focusables.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (event.shiftKey) {
        if (!activeElement || activeElement === first || !root.contains(activeElement)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (!activeElement || activeElement === last || !root.contains(activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }

    root.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(rafId)
      root.removeEventListener('keydown', handleKeyDown)
      releaseBodyLock()
      if (previousActive && document.contains(previousActive)) previousActive.focus()
    }
  }, [active])

  return ref
}
