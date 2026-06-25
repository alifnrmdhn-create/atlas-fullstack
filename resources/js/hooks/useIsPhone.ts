import { useEffect, useState } from 'react'

/**
 * useIsPhone — deteksi viewport phone (≤640px = token `--bp-sm`, breakpoint
 * yang sama dengan shell off-canvas di `shell.css`).
 *
 * SSR/first-paint aman: mengembalikan `false` saat render awal, lalu sinkron
 * via `matchMedia` setelah mount. Dipakai untuk memilih varian struktural yang
 * TIDAK bisa diselesaikan murni CSS — mis. Home launcher (mobile-native) vs
 * dashboard kokpit (desktop), atau bottom-sheet vs modal terpusat.
 *
 * Untuk perbedaan yang bisa di-CSS (grid/padding/show-hide), tetap pakai
 * `@media (max-width: 640px)` — jangan pakai hook ini.
 */
export const PHONE_BREAKPOINT = 640

export function useIsPhone(breakpoint: number = PHONE_BREAKPOINT): boolean {
  const [isPhone, setIsPhone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setIsPhone(mql.matches)
    onChange() // sinkron nilai awal setelah mount

    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    // Safari < 14 fallback
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [breakpoint])

  return isPhone
}
