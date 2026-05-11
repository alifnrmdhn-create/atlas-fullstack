<?php

namespace App\Http\Controllers;

use App\Models\BroadcastEvent;
use App\Models\ChannelMember;
use App\Models\UserSession;
use App\Models\UserStatus;
use App\Services\BroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * SSE endpoint untuk push event real-time ke browser.
 *
 * Arsitektur: setiap mutation endpoint INSERT event ke tabel broadcast_events.
 * Controller ini polling tabel itu setiap ~2 detik, filter by userId, lalu
 * stream ke client via Server-Sent Events.
 *
 * Lifecycle satu koneksi:
 *   1. Mark UserStatus = ONLINE (kalau sebelumnya OFFLINE)
 *   2. Create UserSession record
 *   3. Loop (maks 5 menit per koneksi — client reconnect):
 *        - Query events id > lastEventId, terkait user
 *        - Stream as SSE
 *        - Heartbeat tiap 20 detik
 *        - Abort kalau client disconnect
 *   4. On disconnect: close UserSession (fire-and-forget via shutdown callback
 *      tidak reliable di PHP; ghost-cleanup command yang handle ini)
 */
class RealtimeController extends Controller
{
    private const STREAM_TTL_SECONDS = 90;        // Reconnect lebih sering — lebih ramah proxy edge yang time-out long connections
    private const POLL_INTERVAL_US   = 400_000;   // 0.4 detik — typing indicator perlu sub-second delivery via SSE
    private const HEARTBEAT_SECONDS  = 10;        // Keepalive lebih sering supaya proxy tidak menganggap idle/buffered
    private const IDLE_THRESHOLD_MS  = 90_000;    // 90 detik gap = sesi baru

    public function stream(Request $request): StreamedResponse
    {
        $user = $request->user();
        abort_unless($user, 401);

        // Set presence ONLINE + create session (sebelum stream mulai)
        $this->markOnline($user->id);

        return response()->stream(function () use ($user) {
            // Release session file lock immediately — file-based sessions block
            // concurrent requests from the same browser until the lock is freed.
            // Auth data is already captured in $user above, so this is safe.
            session()->save();

            // Disable PHP output buffering + time limit
            @set_time_limit(self::STREAM_TTL_SECONDS + 30);
            @ini_set('output_buffering', 'off');
            @ini_set('zlib.output_compression', 'off');
            @ini_set('implicit_flush', '1');
            @ob_implicit_flush(true);
            while (ob_get_level()) ob_end_flush();

            // 2KB padding di awal — beberapa proxy/edge butuh response body cukup besar
            // sebelum mulai meneruskan stream. Komentar SSE (": ...") di-ignore oleh client.
            echo ': ' . str_repeat(' ', 2048) . "\n\n";
            flush();

            $this->sendEvent('workspace:ready', [
                'connectedAt' => now()->toIso8601String(),
                'userId' => $user->id,
            ]);

            $lastEventId = (int) (BroadcastEvent::max('id') ?? 0);
            $lastHeartbeat = time();
            $startTime = time();

            while (time() - $startTime < self::STREAM_TTL_SECONDS) {
                if (connection_aborted()) break;

                // Query event terbaru yang relevan untuk user ini
                $events = BroadcastEvent::query()
                    ->where('id', '>', $lastEventId)
                    ->where(function ($q) use ($user) {
                        $q->whereNull('userIds')
                          ->orWhereRaw('"userIds"::jsonb @> ?::jsonb', [json_encode($user->id)]);
                    })
                    ->orderBy('id')
                    ->limit(100)
                    ->get(['id', 'eventType', 'payload']);

                foreach ($events as $event) {
                    $this->sendEvent($event->eventType, $event->payload, $event->id);
                    $lastEventId = $event->id;
                }

                // Heartbeat (comment line "SSE: keep-alive")
                if (time() - $lastHeartbeat >= self::HEARTBEAT_SECONDS) {
                    echo ": heartbeat\n\n";
                    flush();
                    $lastHeartbeat = time();
                }

                usleep(self::POLL_INTERVAL_US);
            }

            // Stream lifetime habis → client reconnect otomatis
            $this->sendEvent('workspace:reconnect', [
                'reason' => 'ttl',
            ]);
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache, no-transform',
            'Connection' => 'keep-alive',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * GET /realtime/poll?since=N — polling fallback untuk environment di mana
     * SSE tidak reliable (mis. `php artisan serve` single-process, proxy buffering).
     * Mengembalikan event yang relevan untuk user dengan id > $since.
     *
     * Frontend menjalankannya berdampingan dengan SSE; dedup terjadi di handler
     * (mis. notifications.some(n => n.id === event.notification.id)).
     */
    public function poll(Request $request)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $since = max(0, (int) $request->query('since', 0));
        $currentMax = (int) (BroadcastEvent::max('id') ?? 0);

        // Seed call (sentinel since > max) — skip query, langsung balikkan max sekarang.
        // Frontend pakai ini untuk inisialisasi lastEventId tanpa banjir event lama.
        if ($since >= $currentMax) {
            return response()->json([
                'events' => [],
                'lastEventId' => $currentMax,
            ]);
        }

        $events = BroadcastEvent::query()
            ->where('id', '>', $since)
            ->where(function ($q) use ($user) {
                $q->whereNull('userIds')
                  ->orWhereRaw('"userIds"::jsonb @> ?::jsonb', [json_encode($user->id)]);
            })
            ->orderBy('id')
            ->limit(200)
            ->get(['id', 'eventType', 'payload']);

        // Selalu majukan lastEventId ke max global supaya next poll tidak re-scan
        // event yang sudah tidak relevan untuk user ini. Kecuali kalau hit LIMIT —
        // berarti ada kemungkinan event lain di antaranya, jangan loncat.
        $lastEventId = $events->count() >= 200
            ? (int) $events->last()->id
            : $currentMax;

        return response()->json([
            'events' => $events,
            'lastEventId' => $lastEventId,
        ]);
    }

    /**
     * POST /realtime/ping — heartbeat dari tab aktif tiap 60 detik.
     * Update lastActivityAt + close/open UserSession sesuai idle threshold.
     */
    public function ping(Request $request)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $now = now();
        $newStatus = null;

        // Update UserStatus (auto ONLINE kalau sebelumnya OFFLINE)
        $current = UserStatus::where('userId', $user->id)->first();
        $shouldGoOnline = !$current || $current->status === 'OFFLINE';
        if ($shouldGoOnline) $newStatus = 'ONLINE';

        UserStatus::updateOrCreate(
            ['userId' => $user->id],
            [
                'lastActivityAt' => $now,
                ...($shouldGoOnline ? ['status' => 'ONLINE'] : []),
            ]
        );

        // Session tracking
        $active = UserSession::where('userId', $user->id)
            ->whereNull('endedAt')
            ->orderByDesc('startedAt')
            ->first();

        if ($active) {
            $gapMs = $active->lastPingAt ? ($now->getTimestampMs() - $active->lastPingAt->getTimestampMs()) : 0;
            if ($gapMs <= self::IDLE_THRESHOLD_MS) {
                // Contiguous activity — extend session
                $active->update([
                    'lastPingAt' => $now,
                    'durationMs' => ($active->durationMs ?? 0) + $gapMs,
                ]);
            } else {
                // Gap too large — close + open new
                $active->update([
                    'endedAt' => $active->lastPingAt,
                    'endReason' => 'idle',
                ]);
                UserSession::create([
                    'userId' => $user->id,
                    'startedAt' => $now,
                    'lastPingAt' => $now,
                ]);
            }
        } else {
            UserSession::create([
                'userId' => $user->id,
                'startedAt' => $now,
                'lastPingAt' => $now,
            ]);
        }

        // Broadcast
        if ($newStatus) {
            BroadcastService::presence($user->id, $newStatus, $now->toIso8601String());
        } else {
            BroadcastService::presenceActivity($user->id, $now->toIso8601String());
        }

        return response()->noContent();
    }

    /**
     * POST /realtime/typing/:channelId — kirim indikator mengetik ke anggota channel.
     * Fire-and-forget: client tidak butuh response body.
     */
    public function typing(Request $request, int $channelId)
    {
        $user = $request->user();
        abort_unless($user, 401);

        $otherMemberIds = ChannelMember::where('channelId', $channelId)
            ->where('userId', '!=', $user->id)
            ->pluck('userId')
            ->all();

        if (!empty($otherMemberIds)) {
            BroadcastService::toUsers('channel:typing:start', [
                'channelId' => $channelId,
                'userId' => $user->id,
                'userName' => $user->name,
            ], $otherMemberIds);
        }

        return response()->noContent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function sendEvent(string $event, mixed $data, ?int $id = null): void
    {
        if ($id !== null) echo "id: {$id}\n";
        echo "event: {$event}\n";
        echo 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
        flush();
    }

    private function markOnline(int $userId): void
    {
        $now = now();

        $current = UserStatus::where('userId', $userId)->first();
        $shouldGoOnline = !$current || $current->status === 'OFFLINE';

        if ($shouldGoOnline) {
            UserStatus::updateOrCreate(
                ['userId' => $userId],
                ['status' => 'ONLINE', 'lastActivityAt' => $now]
            );
            BroadcastService::presence($userId, 'ONLINE', $now->toIso8601String());
        }
    }
}
