# ATLAS — Scale-Readiness Plan (2026-06-16)

> Lanjutan dari audit 2026-06-10. Audit itu dikalibrasi untuk **pilot 41-user,
> single-replica**. Dokumen ini menutup jarak menuju **deployment serius skala
> besar** (multi-replica, ratusan–ribuan user, SLA produksi).
>
> Kesiapan saat ini (terverifikasi 2026-06-16): **~70%** — terbelah jadi
> aplikasi ~90% (matang) vs operasional/skala ~50% (belum tersentuh).

## Prinsip urutan

1. **Ukur dulu, optimasi kemudian.** Tanpa error-tracking + load-test baseline,
   semua tuning skala adalah tebakan. Itu sebabnya S0 = "jaring pengaman" versi skala.
2. **Statelessness sebelum scale-out.** Aplikasi harus bisa jalan di N replica
   identik tanpa state lokal (scheduler, cache, session, file) sebelum replica dinaikkan.
3. **Setiap perubahan: 1 commit, CI hijau, terverifikasi** (pola audit kemarin).
4. **Single-instance tidak boleh rusak** selama transisi — semua task aman untuk
   kondisi 1-replica sekarang, dan membuka jalan ke N-replica.

## Dua target, dua garis finish

| Target | Definisi | Kesiapan kini | Butuh |
|---|---|---|---|
| **A. Single-instance serius** | 1 container besar, ratusan user internal | **~80%** | S0 + S2 + S3 (lewati S1) |
| **B. Scale-out produksi** | multi-replica, ribuan user, SLA | **~60%** | S0 → S1 → S2 → S3 → S4 |

**KEPUTUSAN USER 2026-06-16: target B, tapi pekerjaan ber-biaya non-lokal ditunda.**

### Strategi local-first (Postgres-backed, gratis & shared antar-replica)

Wawasan kunci: korektnes multi-replica TIDAK wajib Redis. Store berbasis
Postgres gratis, lokal, dan shared antar-replica — Redis hanya upgrade kecepatan:

| Kebutuhan multi-replica | Solusi gratis-lokal | Upgrade berbayar (DITUNDA, code-ready) |
|---|---|---|
| Cache konsisten antar-replica | `CACHE_STORE=database` | Redis (lebih cepat) |
| Lock scheduler (`onOneServer`) | database lock store | Redis |
| Session shared | `SESSION_DRIVER=database` (sudah) | Redis |
| Queue | `QUEUE_CONNECTION=database` (tabel sudah ada) | Redis/SQS |
| **File upload shared** | **— (tak ada solusi lokal multi-replica)** | **S3/R2 (wajib; di-wire ready)** |

Konsekuensi: **Target B bisa ~90% dikerjakan lokal**. Yang ditunda (disiapkan
kodenya, tinggal flip config + provision saat siap bayar):
- **S1.4 S3/R2** — satu-satunya yang tak punya padanan lokal multi-replica;
  flysystem-s3 di-wire, default tetap `local`, jadi config-flip.
- **Redis** — sebagai upgrade performa di atas store-Postgres; bukan blocker korektnes.
- **S4.1 staging env** — pakai simulasi multi-replica lokal (2 instance + 1 Postgres) dulu.
- **Sentry** — pakai jalur lokal: structured logging + exception capture ke stderr
  (Railway log), hook Sentry dormant (tanpa DSN = no-op), aktif saat DSN diisi.

---

## Milestone S0 — Visibility & Baseline (ukur sebelum menyentuh apa pun)

| ID | Task | Area | Effort | Risiko | Dep |
|---|---|---|---|---|---|
| S0.1 | **Error tracking (Sentry)** — pasang `sentry/sentry-laravel`, DSN via env, capture exception + slow-query. *Di-skip saat pilot; konteks skala mengangkatnya kembali — "buta saat prod error" jadi risiko harian.* | `bootstrap/app.php` withExceptions, `config/`, composer | **S–M** | Rendah | — |
| S0.2 | **Structured logging ke stdout** — `LOG_CHANNEL=stderr` JSON formatter, `LOG_LEVEL=error` di prod (kini `debug`), correlation id per request. Railway log jadi queryable. | `config/logging.php`, middleware | **S** | Rendah | — |
| S0.3 | **Load-test harness (k6) + baseline** — skenario realistis (login → Home → Workboard → poll loop), jalankan di staging/prod-replica, **catat titik patah single-replica sekarang**. Tanpa ini semua optimasi buta. | `scripts/load/` baru | **M** | Rendah (read-only beban) | S0.1, S0.2 |

**"Done" S0:** exception prod muncul di Sentry dengan stack trace; log prod terstruktur & persist; ada angka p95 latency + RPS-maks single-replica terdokumentasi.

---

## Milestone S1 — Statelessness (blocker keras multi-replica; SKIP untuk target A)

> Keempat ini saat ini **akan pecah kalau replica dinaikkan dari 1 ke 2**.
> Verifikasi 2026-06-16: scheduler per-container, cache file, storage lokal, migrate-on-boot.

| ID | Task | Area | Effort | Risiko | Dep |
|---|---|---|---|---|---|
| S1.1 | **Scheduler → runner tunggal (database lock).** Sekarang `while true; schedule:work` jalan di SETIAP container + lock file-cache per-container + tanpa `onOneServer()` → 2 replica = check-reminders/compute-health/cleanup **jalan ganda**. Fix LOKAL: `onOneServer()` semua schedule + `CACHE_STORE=database` (lock shared via Postgres, S1.3) → hanya 1 replica yang jalankan tiap tick. | `routes/console.php`, `nixpacks.toml` | **M** | Sedang | S1.3 |
| S1.2 | **Migrate → release-phase, bukan per-boot.** `migrate --force` di boot tiap container → rolling-deploy = race. Pindah ke `--isolated` (lock advisory Postgres → hanya 1 container migrasi) + idealnya release-phase Railway. | `nixpacks.toml` start cmd | **S–M** | Sedang (urutan deploy) | — |
| S1.3 | **Cache → database store (Redis ditunda).** `CACHE_STORE=file` per-container → cache scope/membership/settings **beda antar-replica = authz tak konsisten**. Fix LOKAL: `CACHE_STORE=database` (gratis, shared via Postgres yang sudah ada; tabel cache via migration). Session sudah `database`. Redis = upgrade kecepatan nanti (config-flip). | `config/cache.php`, migration cache table, env | **M** | Sedang | — |
| S1.4 | **Uploads → S3-ready (provision DITUNDA).** `FILESYSTEM_DISK=local` + volume Railway = single-replica only. 3 jalur tulis: avatar (`WorkspaceController:1244`), assignment (`AssignmentController::store`), monthly report (`MonthlyReportController:254`). Pasang `league/flysystem-aws-s3`, abstraksikan ke disk config-driven (default tetap `local`), siapkan disk `s3`. Bucket = provision saat siap bayar (config-flip `FILESYSTEM_DISK=s3`). | `config/filesystems.php`, 3 controller, composer | **M** | Sedang | — |

**"Done" S1:** 2 replica jalan bareng tanpa duplikasi job, sesi konsisten, upload
terbaca dari semua replica, deploy tanpa race migrasi. (Dibuktikan di S4.2.)

---

## Milestone S2 — Load shedding & throughput

| ID | Task | Area | Effort | Risiko | Dep |
|---|---|---|---|---|---|
| S2.1 | **Queue worker (sync → database).** `QUEUE_CONNECTION=sync` → notifikasi + broadcast insert jalan inline di request, blokir thread FrankenPHP (1 req = 1 thread). Tabel queue **sudah ada** (`2026_04_25_000003`). Jadikan `BroadcastService::toUsers` + Notification fan-out `ShouldQueue`; jalankan `queue:work` (di service scheduler S1.1 atau sendiri). | `app/Services/BroadcastService`, notif sites, infra worker | **M–L** | Sedang | S1.1 (proses worker) |
| S2.2 | **Paginasi read terberat.** `/tasks` & `/programs` masih `->get()` tanpa batas — di ribuan baris = lambat/OOM. CATATAN PRODUK: Workboard meng-group semua task per-lane; paginasi sejati mengubah UX (butuh "load more"/server-side filter per-lane). Keputusan shape diperlukan (sama seperti Task 2.8 varian ringan). | `TaskController::index`, `ProgramService`, FE loader | **L** | Sedang–tinggi (ubah UX) | butuh keputusan user |
| S2.3 | **Polling tak nulis sesi.** `/realtime/poll` GET di grup `web` + `SESSION_DRIVER=database` → 1 UPDATE sesi per tab per 2 detik (500 user ≈ 250 write/s konstan). Exclude route poll dari session persist, atau Redis session (S1.3). | `RealtimeController`, middleware, `routes/web.php` | **S–M** | Rendah | — |
| S2.4 | **Rate limiting API.** Kini hanya login yang throttle. Tambah `throttle:` pada mutasi + poll untuk redam runaway client/abuse. | `routes/web.php`, `app/Providers` | **S** | Rendah | — |

**"Done" S2:** load-test (S0.3) menunjukkan p95 & RPS-maks naik signifikan;
request thread tak lagi diblok kerja inline; poll tak membebani DB tulis.

---

## Milestone S3 — Data durability & growth

| ID | Task | Area | Effort | Risiko | Dep |
|---|---|---|---|---|---|
| S3.1 | **Pruning tabel tumbuh-terus.** Kini hanya broadcast_events (15min) + form-drafts (harian) di-prune. **Tak ada** penghapus untuk: `Notification` (punya index `expiresAt` tapi nol kode hapus), `UserSession` (ghost-cleanup cuma menutup, tak hapus), `WorkItemStatusLog`, `position_history`. Tambah scheduled prune dengan retensi konfigurable. | `routes/console.php`, command baru | **M** | Rendah | — |
| S3.2 | **Index hilang di kolom filter terpanas.** `Program` ter-index `ownerId/status/startDate/healthStatus` tapi **bukan** `ownerUnitId`+`approvalStatus`+`archivedAt` (filter terpanas di ProgramService & overview). `ChannelMember` PK (channelId,userId) tak bantu `where userId`. ⚡ QUICK WIN. | migration baru | **S** | Rendah | — |
| S3.3 | **Cache agregat mahal + hardening backup.** `homeSnapshot` (ScorecardSummaryService — nol cache, jalan tiap hit `/`) & scorecard matrix dihitung ulang per-request; data bulanan → cache + invalidate saat import KPI. Plus: uji-restore backup 1× (drill), pertimbangkan PITR. | ScorecardSummaryService, PerformanceController; runbook backup | **M** | Rendah | — |
| S3.4 | **Password default → wajib reset.** `Password123!` hardcoded di `storeUser`. *Di-skip saat pilot; provisioning user lebih banyak saat skala mengangkatnya.* Acak + flag must-change saat login pertama. | `WorkspaceController::storeUser`, migration flag, FE login | **M** | Sedang (alur onboarding) | — |

**"Done" S3:** tabel besar punya retensi; query terpanas ter-index; Home/scorecard
tak dihitung ulang tiap request; restore backup terbukti jalan.

---

## Milestone S4 — Validation & cutover

| ID | Task | Area | Effort | Risiko | Dep |
|---|---|---|---|---|---|
| S4.1 | **Staging environment** cermin prod (Railway env terpisah, data seed/anon). Tempat aman load-test & uji multi-replica. | infra Railway | **M** | Rendah | — |
| S4.2 | **Uji multi-replica + load-test skala target.** Naikkan replica di staging, buktikan: scheduler single-run (S1.1), sesi/upload konsisten (S1.3/1.4), nol job duplikat. Jalankan ulang k6 (S0.3) di beban target. | staging | **M** | Rendah | S1.*, S4.1 |
| S4.3 | **Runbook ops** — rollback, scale up/down, prosedur insiden, alerting threshold (dari Sentry/metrics). | `docs/` | **S** | Rendah | S0.1 |

**"Done" S4:** angka load-test memenuhi target di multi-replica; runbook ada;
alerting hidup.

---

## Quick wins (kerjakan kapan saja, S effort, dampak nyata)

- **S3.2** index hilang — migration kecil, langsung kurangi beban query terpanas
- **S0.2** structured logging stdout — log prod jadi berguna seketika
- **S2.4** rate limiting — proteksi murah
- **S2.3** poll tanpa session-write (varian middleware-exclude) — redam DB write storm

## Catatan keputusan yang perlu dari user

1. **Target A (single-instance) atau B (scale-out)?** Menentukan apakah S1 dikerjakan.
2. **S2.2 paginasi `/tasks`** — ubah UX Workboard (load-more) atau cukup server-side
   filter? Shape produk, bukan murni teknis.
3. **Redis & S3/R2** — tambah service berbayar di Railway (S1.3, S1.4). Perlu persetujuan biaya.
4. **Sentry** — free tier (5k err/bln) cukup, atau self-host?

## Ringkasan effort (kasar)

| Milestone | Total effort | Menutup gap |
|---|---|---|
| S0 | ~1–1.5 hari | Visibility (buta → terlihat) |
| S1 | ~2–3 hari | Multi-replica jadi mungkin (kini rusak) |
| S2 | ~2–3 hari | Throughput di bawah beban |
| S3 | ~1.5–2 hari | Durabilitas & pertumbuhan data |
| S4 | ~1–1.5 hari | Bukti & runbook |

**Target A** (S0+S2+S3): ~4–6 hari → ~90% siap single-instance serius.
**Target B** (semua): ~8–11 hari → ~90%+ siap scale-out produksi.
