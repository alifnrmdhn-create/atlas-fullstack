<?php

namespace App\Services;

use App\Models\BroadcastEvent;

/**
 * Port dari backend/src/lib/broadcasts.ts.
 *
 * Semua mutation endpoint (POST/PUT/PATCH/DELETE) panggil helper di sini
 * setelah DB commit → event di-insert ke broadcast_events → SSE endpoint
 * poll dan push ke semua browser yang sedang connect.
 *
 * Taxonomy event (sama persis dengan TS):
 *   program:changed, workstream:changed, phase:changed, task:changed,
 *   subtask:changed, blocker:changed, kpi:changed, risk:changed,
 *   meeting:changed, meeting:rsvp-changed, meeting:action-changed,
 *   meeting:decision-changed, report:changed, assignment:changed,
 *   comment:changed, notification:created, presence:updated, presence:activity,
 *   channel:typing:start, channel:typing:stop, reminder:due
 *
 * Pemakaian:
 *   BroadcastService::program($id, 'created', ['code' => 'PRG-001']);
 *   BroadcastService::toUsers('notification:created', [...], [123]);
 *   BroadcastService::all('presence:updated', [...]);
 */
class BroadcastService
{
    /**
     * Emit event ke semua user connected.
     * @param array<string,mixed> $payload
     */
    public static function all(string $eventType, array $payload): void
    {
        BroadcastEvent::create([
            'eventType' => $eventType,
            'payload' => $payload,
            'userIds' => null,
        ]);
    }

    /**
     * Emit event ke user tertentu saja.
     * @param array<string,mixed> $payload
     * @param array<int> $userIds
     */
    public static function toUsers(string $eventType, array $payload, array $userIds): void
    {
        if (empty($userIds)) return;
        BroadcastEvent::create([
            'eventType' => $eventType,
            'payload' => $payload,
            'userIds' => array_values(array_unique($userIds)),
        ]);
    }

    // ── Domain event helpers ─────────────────────────────────────────────────

    public static function program(int $id, string $action, array $context = []): void
    {
        self::all('program:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function workstream(int $id, string $action, array $context = []): void
    {
        self::all('workstream:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function phase(int $id, string $action, array $context = []): void
    {
        self::all('phase:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function task(int $id, string $action, array $context = []): void
    {
        self::all('task:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function subTask(int $taskId, string $action, array $context = []): void
    {
        self::all('subtask:changed', ['taskId' => $taskId, 'action' => $action, ...$context]);
    }

    public static function blocker(int $id, string $action, array $context = []): void
    {
        self::all('blocker:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function kpi(int $id, string $action, array $context = []): void
    {
        self::all('kpi:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function meeting(int $id, string $action, array $context = []): void
    {
        self::all('meeting:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function meetingRsvp(int $meetingId, int $userId, string $rsvpStatus): void
    {
        self::all('meeting:rsvp-changed', [
            'meetingId' => $meetingId, 'userId' => $userId, 'rsvpStatus' => $rsvpStatus,
        ]);
    }

    public static function meetingAction(int $meetingId, int $actionId, string $action): void
    {
        self::all('meeting:action-changed', [
            'meetingId' => $meetingId, 'actionId' => $actionId, 'action' => $action,
        ]);
    }

    public static function meetingDecision(int $meetingId, int $decisionId, string $action): void
    {
        self::all('meeting:decision-changed', [
            'meetingId' => $meetingId, 'decisionId' => $decisionId, 'action' => $action,
        ]);
    }

    public static function report(int $id, string $action, array $context = []): void
    {
        self::all('report:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function assignment(int $id, string $action, array $context = []): void
    {
        self::all('assignment:changed', ['id' => $id, 'action' => $action, ...$context]);
    }

    public static function comment(string $entityType, int $entityId, int $commentId, string $action): void
    {
        self::all('comment:changed', [
            'entityType' => $entityType, 'entityId' => $entityId,
            'commentId' => $commentId, 'action' => $action,
        ]);
    }

    public static function presence(int $userId, string $status, ?string $lastActivityAt = null, ?string $statusEmoji = null, ?string $statusMessage = null): void
    {
        $payload = [
            'userId' => $userId,
            'status' => $status,
            'lastActivityAt' => $lastActivityAt ?? now()->toIso8601String(),
        ];
        // Hanya sertakan emoji/message saat caller eksplisit kirim — agar event
        // dari /realtime/ping (yang tidak tahu message terbaru) tidak menimpa
        // nilai existing di FE jadi null.
        if ($statusEmoji !== null) $payload['statusEmoji'] = $statusEmoji;
        if ($statusMessage !== null) $payload['statusMessage'] = $statusMessage;
        self::all('presence:updated', $payload);
    }

    public static function presenceActivity(int $userId, ?string $lastActivityAt = null): void
    {
        self::all('presence:activity', [
            'userId' => $userId,
            'lastActivityAt' => $lastActivityAt ?? now()->toIso8601String(),
        ]);
    }
}
