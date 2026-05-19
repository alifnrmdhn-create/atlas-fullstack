<?php

namespace App\Http\Controllers;

use App\Models\BroadcastEvent;
use App\Models\ChannelMember;
use App\Models\UserSession;
use App\Models\UserStatus;
use App\Services\BroadcastService;
use Illuminate\Http\Request;

/**
 * Endpoint real-time untuk push event ke browser via polling.
 *
 * Arsitektur: setiap mutation endpoint INSERT ke tabel `broadcast_events`.
 * Frontend GET /realtime/poll setiap 2 detik dengan ?since={lastEventId};
 * controller balikkan event id > since yang relevan untuk user.
 *
 * SSE sempat dipakai tapi di-drop: di FrankenPHP `php-server` mode (dan PHP
 * shared hosting umumnya), 1 koneksi SSE menahan 1 thread PHP sampai TTL.
 * Beberapa user simultan langsung exhaust thread pool. Polling murni: tiap
 * request short-lived, thread cepat balik ke pool, scaling jauh lebih predictable.
 */
class RealtimeController extends Controller
{
    private const IDLE_THRESHOLD_MS = 90_000;    // 90 detik gap = sesi baru

    /**
     * GET /realtime/poll?since=N — kembalikan event id > N yang relevan untuk user.
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

}
