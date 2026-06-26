import { useEffect, useState } from 'react'

/**
 * useCanHover — apakah perangkat punya pointer yang bisa hover (mouse/trackpad)
 * vs touch murni. Berbasis `(hover: hover)`, BUKAN lebar viewport — touch device
 * berukuran besar pun tetap tak bisa hover.
 *
 * Dipakai untuk memilih interaksi: hover-to-show di desktop vs tap-to-toggle di
 * touch (mis. tooltip marker timeline Charter). Selaras pakem
 * `@media (hover: hover)` / `(hover: none)` yang dipakai app-wide.
 *
 * SSR/first-paint: default `true` (asumsi desktop) lalu sinkron setelah mount —
 * aman karena handler tap juga di-attach saat `false`.
 */
export function useCanHover(): boolean {
  const [canHover, setCanHover] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(hover: hover)')
    const onChange = () => setCanHover(mql.matches)
    onChange()

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [])

  return canHover
}
