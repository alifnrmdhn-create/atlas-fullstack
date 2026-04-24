import { useEffect, useRef, useState } from 'react'

/**
 * useAnimatedClose — Keeps an overlay rendered for `duration` ms after it
 * closes so a CSS exit animation can finish before the DOM node is removed.
 *
 * Usage:
 *   const { rendered, closing } = useAnimatedClose(isOpen, 180)
 *   {rendered && (
 *     <div className={closing ? 'my-overlay--closing' : ''}>...</div>
 *   )}
 *
 * The CSS class drives the animation; this hook only controls timing.
 */
export function useAnimatedClose(isOpen: boolean, duration = 160) {
  const [rendered, setRendered] = useState(isOpen)
  const [closing, setClosing]   = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (isOpen) {
      setRendered(true)
      setClosing(false)
    } else if (rendered) {
      setClosing(true)
      timerRef.current = setTimeout(() => {
        setRendered(false)
        setClosing(false)
      }, duration)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  return { rendered, closing }
}
