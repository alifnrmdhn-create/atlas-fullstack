# Panduan Pengguna — Pilot Clear the Path (DKM)

> **Untuk siapa**: User di Direktorat Keuangan & Manajemen Risiko (DKM) selama periode pilot.
> **Versi**: 1.0 — 2026-05-08
> **Sponsor**: Pak M. Iswahyudi (Direktur Keuangan & MR)

## Apa itu Clear the Path?

Saat Anda **stuck** mengerjakan task atau program, dan butuh keputusan/dukungan dari atasan untuk membuka jalan — sistem ini bantu mengarahkan permintaan Anda ke atasan langsung **dengan satu klik**.

Tujuannya bukan menggantikan komunikasi formal, tapi:
1. **Mengurangi friksi** untuk minta bantuan (tidak perlu surat, WA, telepon berulang)
2. **Tracking yang jelas** kapan permintaan disposition (committed / declined / re-routed)
3. **Akuntabilitas dua arah**: requester tahu status, atasan terlihat aging permintaan

---

## Untuk Eksekutor (Officer / Asisten / Kasubdiv)

### Kapan saya pakai?

Pakai saat Anda menemukan **hambatan yang membutuhkan keputusan/dukungan atasan**, contoh:
- Vendor tidak respons, butuh kontak hierarki lebih atas
- Anggaran perlu approval mendesak
- Konflik prioritas yang harus diputuskan KADIV
- Akses sistem/data yang butuh izin atasan

**Jangan pakai untuk**: pertanyaan operasional yang bisa diselesaikan via DM/chat biasa.

### Cara mengajukan eskalasi

#### Dari Blocker (di Task)
1. Buka task yang sedang stuck
2. Scroll ke section **Blockers**
3. Pada blocker yang aktif, klik tombol **"Butuh Dukungan Atasan"**

#### Dari Progress Log (di Program)
1. Buka detail program
2. Tab **Ringkasan** → section **Progress Log**
3. Pada entry yang punya field "Dukungan dibutuhkan", klik tombol **"Butuh Dukungan Atasan"**

#### Mengisi form
Modal akan terbuka dengan field pre-filled:
- **Judul** (wajib) — sudah otomatis terisi, edit kalau perlu
- **Konteks tambahan** (opsional) — jelaskan singkat: apa yang stuck, apa yang Anda butuhkan dari atasan

Klik **"Ajukan Eskalasi"** — selesai. Sistem akan:
- Otomatis arahkan ke atasan langsung Anda
- Kirim notifikasi ke atasan
- Tampilkan eskalasi Anda di **Focus → "Eskalasi yang Saya Ajukan"**

### Track status eskalasi

Buka halaman **Focus** (sidebar pojok kiri atas). Section "**Eskalasi yang Saya Ajukan**" tampilkan semua eskalasi aktif Anda.

| Status | Artinya |
|---|---|
| **Menunggu** (kuning) | Atasan belum disposition |
| **Di-commit** (hijau) | Atasan sudah commit untuk handle, ada due date |
| **Berjalan** (hijau) | Sedang dikerjakan atasan |
| **Selesai** (hijau) | Hambatan sudah dibersihkan |
| **Ditolak** (merah) | Atasan menolak (lihat alasan di detail) |
| **Diteruskan** (abu-abu) | Re-route ke user lain |

**Indikator aging**: bulatan warna di sebelah kanan menunjukkan berapa hari permintaan menunggu. Hijau = baru, kuning = 3+ hari, oranye = 7+ hari, merah = 14+ hari.

### Apa yang harus saya lakukan jika eskalasi ditolak?

1. Klik eskalasi → buka detail di side panel
2. Baca **alasan penolakan** dari atasan
3. Opsi:
   - **Revisi konteks** dan ajukan ulang
   - **Diskusikan langsung** dengan atasan
   - **Eskalasi ke level lebih tinggi** (jika urgent — kontak admin)

---

## Untuk Atasan (Asisten/Kasubdiv/Kadiv yang punya bawahan)

### Saat ada permintaan masuk

Notifikasi **"Clear the Path Requested"** akan muncul di:
- Bell icon (top right) — angka badge
- Halaman **Focus** → section "**Permintaan Clear the Path Saya**"

### Disposition (Commit / Reroute / Decline)

1. Klik permintaan → **side panel** terbuka di kanan
2. Baca konteks (judul + deskripsi + linked program kalau ada)
3. Pilih satu dari 3 aksi:

#### **Commit** (saya akan handle)
- Klik tombol **"Commit (C)"** atau tekan keyboard `C`
- Set **target tanggal selesai** (opsional tapi recommended)
- Tulis **catatan komitmen** (opsional) — misal "Saya akan kontak vendor minggu ini"
- Submit

Setelah commit, status berubah jadi `COMMITTED`. Requester dapat notifikasi.

#### **Reroute** (teruskan ke orang lain)
- Klik **"Reroute (R)"** atau tekan `R`
- Pilih user target reroute (input user ID untuk MVP — typeahead picker di iterasi berikutnya)
- Berikan catatan
- Submit

**Note**: Anda **tidak bisa reroute lintas direktorat** kecuali target adalah BOD. Sistem otomatis block untuk menjaga policy.

#### **Decline** (saya tidak bisa handle ini)
- Klik **"Decline (D)"** atau tekan `D`
- **Wajib** tulis **alasan** (minimal 5 karakter)
- Submit

Decline bukan dosa — kalau memang bukan ranah Anda atau permintaan tidak applicable, decline yang jelas lebih baik daripada committed yang tidak bisa Anda penuhi.

### Resolve (saat hambatan sudah dibersihkan)

Setelah committed dan Anda sudah handle:
1. Buka eskalasi yang status `COMMITTED`
2. Klik **"Tandai Selesai (Cleared)"**
3. Tulis **catatan penyelesaian** — apa yang Anda lakukan, hasilnya apa
4. Submit

Requester dapat notifikasi `CLEAR_PATH_CLEARED`. Loop ditutup.

### Keyboard shortcut (power user)

Saat side panel terbuka dan tidak ada input form aktif:
- `C` = Commit
- `R` = Reroute
- `D` = Decline
- `Escape` = Tutup panel

---

## FAQ

### Q: Apakah eskalasi ini formal?
A: Tidak menggantikan rapat formal/surat — ini lapis baru untuk **disposition cepat**. Untuk keputusan strategis tetap pakai rapat koordinasi (RAPAT_KOORDINASI di modul Schedule). Tapi dengan ledger eskalasi, atasan punya catatan jelas item yang menunggu disposition mereka.

### Q: Atasan saya tidak respons sudah seminggu, apa yang harus saya lakukan?
A: Sistem otomatis menampilkan **aging indicator**. Setelah 7 hari (default oranye), 14 hari (default merah), atasan akan terlihat punya item lama menunggu. Anda bisa:
1. Tunggu dan biarkan visual aging bekerja sebagai social pressure
2. Diskusikan langsung dengan atasan (tunjukkan eskalasi yang stuck)
3. Eskalasi ke level lebih tinggi (manual create dengan target ke kadiv/BOD)

### Q: Bisa hapus eskalasi yang salah ajukan?
A: MVP belum ada delete — tapi Anda bisa minta atasan **decline dengan alasan "duplikat / salah ajukan"**. Status akan `DECLINED` dan ledger Anda tetap akurat.

### Q: Apa bedanya dengan Blocker?
A: 
- **Blocker** = catatan teknis di task (apa yang menghalangi eksekusi task)
- **Clear the Path Request** = permintaan eksplisit ke atasan untuk membantu mengatasi blocker
- Satu blocker bisa **trigger satu atau lebih** Clear the Path request sepanjang waktu

### Q: Saya BOD/admin, bisakah saya lihat semua eskalasi cross-direktorat?
A: Ya, BOD/admin bisa filter `?filter=all` di endpoint `/escalations`. UI dashboard untuk ini tersedia di `/admin/pilot-metrics` (admin-only).

### Q: Apakah Commitment Ledger berbasis eskalasi ini?
A: Bukan — Commitment Ledger di **KPI Saya** menghitung hit rate dari Tasks + Action Items rapat + Penugasan. Eskalasi tidak masuk ledger karena bukan komitmen pribadi Anda, tapi permintaan ke orang lain.

---

## Troubleshooting

### Tombol "Butuh Dukungan Atasan" tidak muncul
- Konfirmasi Anda di direktorat **DKM** (selama periode pilot, fitur scope ke DKM saja)
- Konfirmasi blocker masih `OPEN` atau `IN_PROGRESS` (bukan `RESOLVED`)
- Refresh halaman — kalau baru deploy, JS bundle perlu di-cache fresh

### "Tidak ada atasan langsung untuk eskalasi"
- Profil Anda tidak punya `managerUserId` di sistem
- Hubungi admin untuk set atasan langsung di profile

### "Tidak diizinkan eskalasi lintas direktorat"
- Anda mencoba escalate ke user di direktorat lain
- Default policy: hanya boleh eskalasi dalam direktorat sendiri (kecuali ke BOD)
- Untuk lintas direktorat, eskalasi via BOD atau hubungi admin

### Notifikasi tidak muncul real-time
- Pastikan koneksi internet stabil (notif pakai SSE)
- Tab harus tetap aktif (browser throttle SSE di tab tidak aktif setelah ~5 menit)
- Refresh halaman akan force ambil notifikasi terbaru

---

## Memberi feedback pasca-pilot

Pilot DKM jalan **6 minggu**. Setelah itu evaluasi vs kriteria sukses:
- Avg time-to-disposition < 5 hari
- Hit rate eskalasi > 60%
- Active users > 70% DKM

Anda bisa beri feedback via:
- Survey pasca-pilot (dikirim email)
- Diskusi langsung dengan tim ATLAS
- Issue report ke admin sistem

Tujuan kami: **fitur ini benar-benar membantu, bukan menambah beban administrasi**. Kalau di lapangan terasa friksi, kasih tahu — kami iterate.

---

*Dokumen ini akan di-update selama pilot berdasarkan feedback. Versi terbaru selalu di repo `docs/user-guide-pilot-dkm.md`.*
