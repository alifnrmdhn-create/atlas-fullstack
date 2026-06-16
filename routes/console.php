<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// ── ATLAS background jobs ────────────────────────────────────────────────────
// Port dari backend/src/routes/realtime.ts (Node.js setInterval).
// Jalankan scheduler di production via cron:
//   * * * * * cd /path/to/atlas-fullstack && php artisan schedule:run >> /dev/null 2>&1
//
// onOneServer() (scale-readiness S1.1): scheduler-loop jalan di SETIAP replica
// (nixpacks `while true; schedule:work`). Tanpa ini, di N-replica tiap command
// jalan N× → notifikasi dobel, compute-health balapan. onOneServer pakai lock
// atomik di cache store SHARED (CACHE_STORE=database, S1.3) → hanya 1 replica
// yang eksekusi tiap tick; sisanya skip. withoutOverlapping tetap mencegah
// tumpang-tindih antar-tick di replica yang sama.

Schedule::command('atlas:check-reminders')
    ->everyMinute()
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

Schedule::command('atlas:ghost-cleanup')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

Schedule::command('atlas:cleanup-broadcast-events')
    ->everyMinute()
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

// Sprint 5 — Re-compute auto health untuk semua program aktif tiap 30 menit.
// Penting karena task-overdue & blocker-aging signals berubah karena waktu,
// bukan event mutation.
Schedule::command('atlas:compute-health')
    ->everyThirtyMinutes()
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

// Sprint 6 — Hapus form drafts yang lewat TTL (default 7 hari). Cukup harian
// karena non-time-critical; jalan jam 03:00 saat traffic minim.
Schedule::command('atlas:cleanup-form-drafts')
    ->dailyAt('03:00')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

// Scale-readiness S3.1 — Prune tabel append-only lewat retensi (Notification/
// UserSession/WorkItemStatusLog). Harian jam 03:15 (setelah form-drafts, masih
// jam sepi). Retensi dari config atlas-thresholds.retention.
Schedule::command('atlas:prune-old-records')
    ->dailyAt('03:15')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();
