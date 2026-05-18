import { useEffect, useRef, useState } from 'react'
import './InlineToast.css'

export type ToastTone = 'success' | 'error' | 'info'
export type ToastState = { msg: string; tone: ToastTone } | null

/**
 * Small inline toast hook — reused di halaman yang butuh feedback action
 * sukses/gagal tanpa modal. Auto-dismiss 2.2s (success) / 3.2s (error).
 *
 * Pakai pattern hook + render component supaya halaman cukup:
 *   const toast = useInlineToast()
 *   toast.show('Program berhasil dibuat')
 *   return (<>... <toast.View /></>)
 */
export function useInlineToast() {
  const [toast, setToast] = useState<ToastState>(null)
  const timerRef = useRef<number | null>(null)

  const show = (msg: string, tone: ToastTone = 'success') => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setToast({ msg, tone })
    timerRef.current = window.setTimeout(
      () => setToast(null),
      tone === 'error' ? 3200 : 2200,
    )
  }

  const clear = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    setToast(null)
  }

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
  }, [])

  const View = () => {
    if (!toast) return null
    return (
      <div
        className={`inline-toast inline-toast--${toast.tone}`}
        role="status"
        aria-live="polite"
      >
        <span className="inline-toast__icon" aria-hidden="true">
          {toast.tone === 'error' ? '!' : toast.tone === 'info' ? 'i' : '✓'}
        </span>
        <span>{toast.msg}</span>
      </div>
    )
  }

  return { show, clear, View }
}
