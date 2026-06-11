import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Callback ber-identitas stabil dengan closure selalu segar.
 *
 * Pengganti idiom `useEffectEvent`-sebagai-stable-callback di workspace.tsx
 * (audit 2026-06-10/11): useEffectEvent secara semantik resmi HANYA boleh
 * dipanggil dari effect/effect-event lain — memakainya sebagai callback yang
 * dishare via context & dipanggil dari event handler melanggar
 * react-hooks/rules-of-hooks (40 temuan saat ESLint dipasang). Hook ini
 * memberikan properti yang sama yang dibutuhkan pemakainya:
 *   - identitas fungsi stabil antar render (aman jadi dependency/context value)
 *   - body selalu membaca state/props render terakhir (tanpa stale closure)
 * tanpa menyentuh semantik effect-event.
 *
 * Catatan: jangan dipanggil saat render (sama seperti effect event) — hanya
 * dari handler/effect setelah commit; useLayoutEffect menjamin ref ter-update
 * sebelum event apa pun sempat jalan.
 */
export function useStableCallback<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  const ref = useRef(fn)
  useLayoutEffect(() => { ref.current = fn })
  return useCallback((...args: Args) => ref.current(...args), [])
}
