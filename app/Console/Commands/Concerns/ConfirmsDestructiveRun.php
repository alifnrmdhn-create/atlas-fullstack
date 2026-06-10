<?php

namespace App\Console\Commands\Concerns;

/**
 * Rem pengaman untuk command tulis-massal (simulate-progress, seed-progress-logs,
 * link-scorecard-kpi, dst).
 *
 * Dua skenario berbahaya yang dijaga:
 *   1. Jalan di container produksi (APP_ENV=production).
 *   2. Jalan dari mesin lokal dengan env-override DATABASE_URL /
 *      DATABASE_PUBLIC_URL menunjuk DB prod Railway — APP_ENV tetap "local",
 *      jadi deteksi WAJIB lewat host DB remote, bukan cuma environment.
 *
 * Perilaku: --dry-run & DB lokal selalu lolos; selain itu wajib --force atau
 * konfirmasi interaktif. Non-interaktif (railway run / CI) tanpa --force → batal.
 */
trait ConfirmsDestructiveRun
{
    protected function confirmDestructiveRun(): bool
    {
        if ((bool) $this->option('dry-run')) {
            return true;
        }

        $conn = (string) config('database.default');
        $url = (string) (config("database.connections.{$conn}.url") ?? '');
        $host = $url !== ''
            ? (string) (parse_url($url, PHP_URL_HOST) ?: '')
            : (string) (config("database.connections.{$conn}.host") ?? '');

        $isLocalHost = in_array($host, ['127.0.0.1', 'localhost', '::1', ''], true);
        $isProdEnv = app()->environment('production');

        if (! $isProdEnv && $isLocalHost) {
            return true;
        }

        $this->warn("Target DB host: {$host} | APP_ENV: " . app()->environment());
        $this->warn('Command ini MENULIS MASSAL ke database tersebut.');

        if ((bool) $this->option('force')) {
            $this->info('--force diberikan — lanjut tanpa konfirmasi.');
            return true;
        }

        if (! $this->input->isInteractive()) {
            $this->error('Dibatalkan: sesi non-interaktif tanpa --force. Tambahkan --force bila memang disengaja.');
            return false;
        }

        return $this->confirm('Lanjutkan menulis ke database ini?');
    }
}
