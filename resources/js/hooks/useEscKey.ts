import { useEffect, useRef } from 'react'

/**
 * useEscKey — Closes an overlay when the user presses Escape.
 *
 * Convention: every overlay (modal, drawer, dropdown, panel) in ATLAS must
 * call this hook. Pass `active = false` when the overlay is closed so the
 * listener is automatically removed.
 *
 * The callback is stored in a ref so callers can pass inline functions
 * without needing useCallback — the listener re-registers only when `active`
 * changes, not on every render.
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active])
}
