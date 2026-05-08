/**
 * Post-MVP — Onboarding Tour Definitions (Shepherd.js).
 *
 * Setiap tour adalah array of step. Lazy import shepherd.js supaya tidak
 * membebani initial bundle.
 *
 * Convention:
 *   - Setiap step `attachTo` ke selector — kalau tidak ditemukan, step skip
 *     (Shepherd default behavior)
 *   - Step terakhir tutup tour + mark completed di backend
 *   - Tour ID dipakai sebagai key di User.toursCompleted JSON
 */

export type TourId =
  | 'escalation-inbox'       // pertama buka Inbox dengan section escalation
  | 'clear-path-button'      // pertama lihat tombol "Butuh Dukungan Atasan"
  | 'triage-panel'           // pertama buka triage panel (atasan)
  | 'commitment-ledger'      // pertama akses Komitmen Saya

export type TourStep = {
  id: string
  title: string
  text: string
  attachTo?: { element: string; on: 'top' | 'bottom' | 'left' | 'right' }
  buttons?: Array<{ text: string; type?: 'next' | 'back' | 'cancel' | 'complete' }>
}

export const TOURS: Record<TourId, TourStep[]> = {
  'escalation-inbox': [
    {
      id: 'welcome',
      title: 'Clear the Path',
      text: 'Selamat datang di fitur Clear the Path. Saat tim stuck, sistem ini bantu mengarahkan permintaan dukungan ke atasan langsung tanpa friksi.',
    },
    {
      id: 'incoming-section',
      title: 'Permintaan untuk Anda',
      text: 'Section ini menampilkan permintaan dari tim yang menunggu disposition Anda. Klik salah satu untuk membuka panel triage.',
      attachTo: { element: '[data-tour="escalation-incoming"]', on: 'bottom' },
    },
    {
      id: 'mine-section',
      title: 'Eskalasi Anda',
      text: 'Di sini Anda lihat status eskalasi yang Anda ajukan — siapa yang sudah commit, kapan due date, atau apakah masih menunggu.',
      attachTo: { element: '[data-tour="escalation-mine"]', on: 'bottom' },
    },
  ],
  'clear-path-button': [
    {
      id: 'button-intro',
      title: 'Butuh Dukungan Atasan?',
      text: 'Tombol ini muncul di blocker yang aktif. Saat Anda stuck dan butuh keputusan dari atasan, tinggal klik — system akan otomatis mengarahkan ke atasan langsung Anda.',
      attachTo: { element: '[data-tour="escalation-button"]', on: 'top' },
    },
  ],
  'triage-panel': [
    {
      id: 'panel-intro',
      title: 'Disposition cepat',
      text: 'Tiga aksi tersedia: Commit (saya akan bersihkan), Reroute (teruskan ke orang lain), Decline (tidak relevan, dengan alasan).',
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcut',
      text: 'Power user: tekan C untuk Commit, R untuk Reroute, D untuk Decline. Lebih cepat tanpa lepas tangan dari keyboard.',
    },
  ],
  'commitment-ledger': [
    {
      id: 'ledger-intro',
      title: 'Komitmen Saya',
      text: 'Track consistency Anda dari 3 sumber: Tasks, Action Items rapat, dan Penugasan. Hit rate ≥80% selama X minggu = streak.',
      attachTo: { element: '[data-tour="commitment-ledger"]', on: 'top' },
    },
    {
      id: 'helper',
      title: 'Mengukur diri sendiri',
      text: 'Tujuan ledger ini bukan menghukum, tapi membantu Anda lihat pola konsistensi. Atasan langsung juga bisa lihat ini untuk pembinaan yang lebih spesifik.',
    },
  ],
}

export function tourExists(tourId: string): tourId is TourId {
  return tourId in TOURS
}
