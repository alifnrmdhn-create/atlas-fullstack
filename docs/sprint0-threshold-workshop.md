# Sprint 0 Track C — Threshold Workshop

> **Tujuan**: Konfirmasi nilai threshold yang akan mempengaruhi perilaku Andon, Clear the Path, Commitment Ledger, dan Auto-Health.
> **Stakeholder**: Pak M. Iswahyudi (Direktur Keuangan & MR) sebagai sponsor pilot DKM.
> **Hasil**: Values disimpan di `config/atlas-thresholds.php` dengan override via .env.

## Cara Pakai Dokumen Ini

1. Review tabel di setiap bagian
2. Tandai default yang OK, atau tulis angka pengganti di kolom "Disepakati"
3. Setelah konfirmasi, update `config/atlas-thresholds.php` (atau .env saja jika tidak mau touch config)

---

## 1. Escalation Aging (Sprint 4 — Clear the Path)

**Konteks**: Saat user submit "Butuh Dukungan Atasan", request akan menunggu disposition. Indikator visual berubah warna seiring waktu — ini bukan deadline, hanya signal aging.

| Threshold | Default | Disepakati | Catatan |
|---|---|---|---|
| Berubah kuning setelah | 3 hari | ___ | Soft signal: "perlu perhatian" |
| Berubah oranye setelah | 7 hari | ___ | "Terlambat respond" |
| Berubah merah setelah | 14 hari | ___ | "Critical, bisa di-eskalasi lebih jauh" |

**Pertimbangan**: BUMN hierarchy biasanya butuh waktu disposition. 3/7/14 hari mengakomodasi cuti, perjalanan dinas, dst. Kalau target disposition 3 hari, threshold yellow bisa diset 1 hari.

---

## 2. Action Item Carryover (Sprint 4)

**Konteks**: Action item di rapat koordinasi yang belum selesai akan "carry over" ke rapat berikutnya. Carry-over berulang = signal stuck.

| Threshold | Default | Disepakati | Catatan |
|---|---|---|---|
| Nudge soft (badge kuning + prompt) | 2x carry | ___ | "Apa yang stuck?" satu kalimat |
| Auto suggest Clear the Path | 3x carry | ___ | Muncul di queue atasan sebagai saran |
| Force disposition (lock edit) | 4x carry | ___ | Atasan harus Commit/Reroute/Decline |

**Pertimbangan**: Terlalu cepat = annoying. Terlalu lambat = stuck items menumpuk. Default 2/3/4 = friction bertingkat natural.

---

## 3. ProgressLog Freshness (Sprint 5)

**Konteks**: Program tanpa update progress log dalam X hari dianggap stale.

| Threshold | Default | Disepakati | Catatan |
|---|---|---|---|
| Stale setelah | 7 hari | ___ | Health auto-yellow saat stale |

**Pertimbangan**: Mingguan = sehat untuk Cadence of Accountability. Kalau cadence rapat 2-mingguan, threshold bisa 14 hari.

---

## 4. Auto-Health Derivation (Sprint 5)

**Konteks**: Sistem hitung `autoHealthStatus` dari signal aktual (tasks overdue, blockers, KPI deviation). Disandingkan dengan self-reported `healthStatus`. Discrepancy badge muncul kalau beda terlalu jauh.

### Ambang Derive RED
| Signal | Default | Disepakati |
|---|---|---|
| % tasks overdue | 30% | ___ |
| Open blocker count | 3 | ___ |
| KPI deviation di bawah target | 25% | ___ |

### Ambang Derive YELLOW
| Signal | Default | Disepakati |
|---|---|---|
| % tasks overdue | 10% | ___ |
| Open blocker count | 1 | ___ |
| KPI deviation di bawah target | 10% | ___ |

### Discrepancy Threshold
| Threshold | Default | Disepakati | Catatan |
|---|---|---|---|
| Level beda untuk badge | 1 | ___ | GREEN=0, YELLOW=1, RED=2 — diff ≥ 1 = badge |

**Pertimbangan**: Kalau threshold derive RED terlalu rendah, terlalu banyak program merah. Kalau terlalu tinggi, hilang nilai signal. 30% overdue cukup ketat untuk bisnis musiman seperti tanaman.

---

## 5. MonthlyReport "Suspiciously Clean" (Sprint 5)

**Konteks**: Reviewer (KASUBDIV/KADIV) lihat indicator kalau laporan tampak terlalu bersih dibanding history. Anti-ABS soft signal — tidak block submit.

| Threshold | Default | Disepakati | Catatan |
|---|---|---|---|
| Min kendala untuk dianggap "tidak suspicious" | 2 | ___ | Kalau current <2 dan history avg >2 |
| Lookback period (bulan) | 3 | ___ | Berapa bulan sebelumnya dibandingkan |

**Pertimbangan**: Tujuan bukan menuduh, tapi soft nudge ke reviewer untuk verifikasi. Bisa di-tune setelah pilot.

---

## 6. Pilot DKM Success Criteria (Sprint 4 Evaluation)

**Konteks**: Setelah 6 minggu pilot di Direktorat Keuangan & MR, kita evaluasi expand atau iterate berdasarkan metrik berikut.

| Kriteria | Default Target | Disepakati | Catatan |
|---|---|---|---|
| Avg waktu disposition request | < 5 hari | ___ | Dari REQUESTED → COMMITTED |
| Min hit rate aggregate (DKM users) | > 60% | ___ | Commitment Ledger weekly |
| Min user satisfaction score (survey 1–10) | > 7 | ___ | Survey post-pilot |
| Min active users pct | > 70% DKM users | ___ | Yang pernah pakai feature minimal 1× per minggu |
| Periode evaluasi | 6 minggu | ___ | Dari rilis pilot |

**Pertimbangan**: Metrik ini soft. Yang lebih penting: kualitatif feedback. Tapi punya angka anchor membantu decision gate.

---

## 7. Commitment Ledger (Sprint 4)

**Konteks**: Halaman "Komitmen Saya" tampilkan hit rate weekly dan streak.

| Setting | Default | Disepakati |
|---|---|---|
| Lookback periode | 12 minggu | ___ |
| Min hit rate untuk streak count | 80% | ___ |
| Alert atasan kalau hit rate ≤ X selama Y minggu | ≤60% selama 4 minggu | ___ |

**Pertimbangan**: Streak 80% achievable. Alert 60% selama 4 minggu = pattern persistent, bukan glitch sekali.

---

## 8. Inbox Today Cache (Sprint 2)

| Setting | Default | Disepakati |
|---|---|---|
| Cache TTL | 60 detik | ___ |

**Pertimbangan**: Cukup pendek supaya status terbaru kelihatan, cukup panjang supaya tidak hammer DB saat user reload.

---

## Cara Override (Tanpa Edit Config)

Setiap threshold bisa di-override via `.env`:

```env
# Contoh override untuk environment production
ATLAS_ESC_YELLOW_DAYS=2
ATLAS_ESC_ORANGE_DAYS=5
ATLAS_PILOT_DISPOSITION_TARGET=3
```

Lihat `config/atlas-thresholds.php` untuk daftar lengkap variabel env.

---

## Sign-off

| Yang | Nama | Tanda tangan | Tanggal |
|---|---|---|---|
| Sponsor | Pak M. Iswahyudi (DKM) | ___ | ___ |
| PM/Lead | ___ | ___ | ___ |
| Engineering | ___ | ___ | ___ |

---

## Action Items untuk Stakeholder

1. Review nilai default di setiap section
2. Konfirmasi atau usulkan angka alternatif di kolom "Disepakati"
3. Khusus pilot DKM (section 6) — kalau target terlalu ambisius/kendor, ajustment di sini menentukan keputusan expand
4. Setelah workshop selesai, dev akan apply hasil ke `config/atlas-thresholds.php` (sekali commit, lalu fine-tuning via .env)
