import { useEffect, useRef } from 'react'

/**
 * useEscKey — Closes an overlay when the user presses Escape.
 *
 * Convention: every overlay (modal, drawer, dropdown, panel) in ATLAS must
 * call this hook. Pass `active = false` when the overlay is closed so the
 * listener is automatically removed.
 *
 * Stack semantics (LIFO): when several overlays are active at once, only
 * the most recently activated one receives Escape. This prevents the
 * race-condition where a child modal would close itself AND the parent
 * panel underneath in the same keystroke. Stack order follows the order
 * in which `active` flipped from false → true, so a nested edit field
 * that is toggled on later naturally wins over the surrounding panel.
 *
 * Caveat: if two overlays both become active in the same render pass,
 * React runs child effects before parent — child pushes first, parent
 * ends on top. In practice every overlay in ATLAS is opened by an
 * explicit user gesture (click, route change), so they activate one at
 * a time and the LIFO order matches the user's mental model.
 *
 * The callback is stored in a ref so callers can pass inline functions
 * without needing useCallback — the stack entry re-registers only when
 * `active` changes, not on every render.
 *
 * For dirty-confirm or async-saving guards, do the check inline:
 *   useEscKey(() => {
 *     if (saving) return
 *     if (isDirty && !window.confirm('Buang perubahan?')) return
 *     onClose()
 *   }, open)
 *
 * @param onEsc  Callback to run when Escape is pressed.
 * @param active Whether the listener should be attached (default: true).
 *               Pass the "is-open" boolean so the hook self-manages.
 */
export function useEscKey(onEsc: () => void, active = true): void {
  const onEscRef = useRef(onEsc)
  useEffect(() => { onEscRef.current = onEsc })

  useEffect(() => {
    if (!active) return
    const entry: StackEntry = () => onEscRef.current()
    escStack.push(entry)
    ensureListener()
    return () => {
      const idx = escStack.lastIndexOf(entry)
      if (idx >= 0) escStack.splice(idx, 1)
    }
  }, [active])
}

// ── Module-level stack & single global listener ─────────────────────────────
type StackEntry = () => void
const escStack: StackEntry[] = []
let listenerAttached = false

function ensureListener(): void {
  if (listenerAttached || typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (escStack.length === 0) return
    // Top-of-stack handles it. Don't preventDefault — let native handlers
    // (e.g. closing the browser's autocomplete dropdown) still run.
    const top = escStack[escStack.length - 1]
    top()
  })
}
