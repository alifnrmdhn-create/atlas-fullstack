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

Schedule::command('atlas:check-reminders')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('atlas:ghost-cleanup')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('atlas:cleanup-broadcast-events')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();
