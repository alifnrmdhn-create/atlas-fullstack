# Load-test baseline (scale-readiness S0.3)

Harness: `scripts/load/load-test.mjs` (zero-install, Node). Mengukur p50/p95/p99
latency, RPS, error-rate untuk jalur baca terpanas + poll, di bawah konkurensi.

## ⚠ Keterbatasan baseline lokal

Server lokal = `php artisan serve` **single-thread** → request ter-serialisasi,
angka absolut TIDAK representatif untuk prod FrankenPHP (num_cpu×2 thread).
Gunakan baseline lokal untuk **perbandingan before/after** pada perubahan kode.
Baseline kapasitas absolut (titik patah, RPS-maks) = run di **staging/prod-like
multi-replica (S4.2)**.

## Baseline #0 — 2026-06-16, lokal, 10 VU × 12s (pra-optimasi S2)

Server: `php artisan serve` :9000, dataset dev (97 program / 283 task).

| Endpoint | reqs | err | p50 | p95 | p99 |
|---|---|---|---|---|---|
| GET /realtime/poll | 584 | 0 | 55 | 100 | 146 |
| GET / | 105 | 0 | 76 | 132 | 160 |
| GET /workspace/overview | 106 | 0 | 92 | 135 | 211 |
| **GET /tasks** | 148 | 0 | **227** | **301** | **345** |
| GET /channels | 110 | 0 | 59 | 96 | 138 |
| GET /programs | 66 | 0 | 105 | 139 | 205 |
| GET /organization/program-summary | 76 | 0 | 48 | 196 | 439 |
| GET /my-work | 68 | 0 | 57 | 104 | 165 |
| GET /notifications | 87 | 0 | 52 | 78 | 126 |
| GET /apms/kpi | 72 | 0 | 43 | 75 | 106 |
| **TOTAL** | 1422 | 0% | 61 | 230 | 276 |

### Temuan
- **`/tasks` ~4× lebih lambat** dari endpoint lain (p50 227ms) — bottleneck baca
  terkonfirmasi. Target paginasi S2.2. (Payload sudah −63% di Task 2.8, tapi
  283 baris tetap di-serialisasi + di-group di PHP.)
- `/organization/program-summary` p99 tinggi (439ms) = cache-miss awal (cache
  3 menit ada; warm-up). Kandidat cache lebih agresif S3.3.
- Poll (terfrekuen) tercepat (p50 55ms) — sehat; beban DB-write sesi (S2.3)
  tak terukur di latency, hanya di load DB.
- 0% error di 117 RPS pada dev-server single-thread.

> Run ulang baseline setelah tiap perubahan S2/S3 dan tempel hasilnya di sini
> untuk melacak progres. Run di prod/staging saat S4.2.
