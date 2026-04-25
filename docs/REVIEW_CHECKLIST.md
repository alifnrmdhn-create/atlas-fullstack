# ATLAS — Feature Review Checklist

Gunakan checklist ini **sebelum merge** setiap fitur baru. Centang semua yang relevan.

---

## 1. Status & Guard Consistency

- [ ] Setiap **status baru** sudah dicek di semua tempat yang menggunakan status sebelumnya
- [ ] Semua tombol aksi (edit, delete, add) punya guard `!isXxx` untuk setiap terminal/locked state
- [ ] Backend endpoint: setiap status transition punya guard yang reject state yang tidak valid
- [ ] `canRsvp`, `canEdit`, `canDelete` logic konsisten antara frontend dan backend

## 2. Form Validation

- [ ] Semua input punya `maxLength` yang sesuai dengan backend Zod schema
- [ ] Semua input wajib punya `required` attribute (date, time, judul)
- [ ] Validasi tanggal: tidak bisa di masa lalu (kecuali edit/reschedule)
- [ ] Validasi range: endTime > startTime, endDate >= startDate
- [ ] Submit button `disabled` saat field tidak valid (trim().length < min)
- [ ] Pesan error spesifik per field, bukan generic "gagal"

## 3. Loading & Async Safety

- [ ] Setiap tombol yang trigger async: `disabled` saat loading, teks berubah ("Menyimpan…")
- [ ] Semua form field: `disabled` saat parent form sedang saving (mencegah double-submit)
- [ ] Modal close (backdrop click, X button, ESC): blocked saat saving
- [ ] Operasi delete/cancel: `disabled` saat saving berlangsung
- [ ] Per-item optimistic lock untuk list items (misal: `toggleLoading === item.id`)

## 4. Feedback ke User

- [ ] Operasi sukses: ada success toast / pesan konfirmasi yang auto-dismiss
- [ ] Operasi gagal: error ditampilkan di dekat tombol, bukan di-swallow dengan `.catch(() => {})`
- [ ] Loading state: ada spinner / teks "Memuat…" saat fetch data awal
- [ ] Empty state: ada pesan jelas saat list kosong (bukan blank/kosong)
- [ ] Non-critical background fetch (misal: prep packet): ada fallback pesan jika gagal

## 5. Data Scope & Authorization

- [ ] Picker (delegate, assignee, dll): hanya tampilkan user yang relevan ke konteks (bukan semua user)
- [ ] Backend: setiap PATCH/DELETE cek `organizerId === currentUser.id` sebelum allow
- [ ] Backend: setiap aksi yang ada guard role sudah dicek di semua endpoint terkait
- [ ] Linked entity (program, initiative): cek existence sebelum simpan, bukan assume valid

## 6. State Synchronization

- [ ] Setelah operasi sukses: UI di-refresh dari server (bukan hanya update local state)
- [ ] Setelah filter/view berubah: stale data dari state sebelumnya di-clear sebelum fetch baru
- [ ] Saat entity berubah di luar panel (misal: meeting dipilih beda): semua transient state di-reset
- [ ] `selectedMeeting` / detail panel: di-update saat underlying data berubah (bukan versi stale)

## 7. Edge Cases

- [ ] Empty list: semua section punya empty state message
- [ ] Single item: layout tidak rusak dengan 1 item
- [ ] Maximum limit: ada validasi jika ada batas (misal: max 100 attendee)
- [ ] Karakter khusus di input: tidak menyebabkan crash atau tampilan rusak
- [ ] Meeting spanning midnight: waktu ditampilkan dengan benar
- [ ] User tanpa unit/positionTitle: UI tidak crash (optional fields di-handle)

## 8. Accessibility & Keyboard

- [ ] Semua modal punya ESC handler yang menutup modal
- [ ] Semua modal: focus diarahkan ke field pertama saat buka (`autoFocus`)
- [ ] Tombol delete/konfirmasi punya `type="button"` (tidak trigger form submit)
- [ ] Semua icon-only button punya `aria-label` atau `title`
- [ ] Tab order logis di dalam form

## 9. Timezone & Date Display

- [ ] Semua `Intl.DateTimeFormat` call punya `timeZone: 'Asia/Jakarta'`
- [ ] Date input (`type="date"`) menggunakan format `YYYY-MM-DD` lokal, bukan UTC
- [ ] Tanggal yang ditampilkan ke user: sertakan konteks WIB jika ada ambiguitas

## 10. CSS & Layout

- [ ] Long text (judul, lokasi): ada `overflow: hidden` + `text-overflow: ellipsis` atau `line-clamp`
- [ ] Mobile (≤600px): layout tidak overflow horizontal
- [ ] Modal di mobile: scrollable jika konten panjang
- [ ] Status badge baru: ada warna dan CSS class yang konsisten dengan badge lain

---

## Cara Pakai

1. Copy checklist ini ke PR description
2. Centang semua item yang relevan dengan fitur yang diubah
3. Item yang **tidak relevan** boleh di-skip dengan catatan singkat kenapa
4. Item yang **gagal** → fix dulu sebelum merge

---

*Diperbarui: 2026-04-16 — dibuat berdasarkan pola temuan dari iterasi review 1–13 ATLAS Jadwal module.*
