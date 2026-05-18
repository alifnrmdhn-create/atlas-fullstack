<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\MeetingAttendee;
use App\Models\MeetingDecision;
use App\Models\Notification;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Services\BroadcastService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class MeetingController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

    private function validationError(Request $request, string $message): JsonResponse|RedirectResponse
    {
        if ($request->expectsJson()) {
            return response()->json([
                'message' => $message,
                'errors' => ['general' => [$message]],
            ], 422);
        }

        return back()->withErrors([$message]);
    }

    private function canSeeAll(string $role): bool
    {
        return in_array(strtoupper($role), ['BOD', 'ADMIN', 'SUPERADMIN'], true);
    }

    private function assertAccess(Meeting $meeting, int $userId, string $role): void
    {
        $isParticipant = $meeting->organizerId === $userId
            || $meeting->attendees->contains('userId', $userId);
        if (!$isParticipant && !$this->canSeeAll($role)) {
            abort(403, 'Tidak memiliki akses ke meeting ini.');
        }
    }

    private function notifyMeetingUsers(array $userIds, string $type, string $message, int $meetingId): void
    {
        foreach (array_unique($userIds) as $uid) {
            $uid = (int) $uid;
            if ($uid <= 0) continue;
            $notif = Notification::create([
                'userId' => $uid,
                'type' => $type,
                'message' => $message,
                'source' => "meeting:{$meetingId}",
                'createdAt' => now(),
                'state' => 'UNREAD',
            ]);
            BroadcastService::toUsers('notification:created', [
                'notification' => $notif,
            ], [$uid]);
        }
    }

    private function enrichMeetings($meetings): array
    {
        if ($meetings->isEmpty()) return [];

        $userIds = collect();
        foreach ($meetings as $m) {
            $userIds->push($m->organizerId);
            foreach ($m->attendees as $a) {
                $userIds->push($a->userId);
                if ($a->delegateToId) $userIds->push($a->delegateToId);
            }
        }

        $userMap = User::query()
            ->whereIn('id', $userIds->unique()->values())
            ->with('unit:id,code,name')
            ->get(['id','name','avatarUrl','roleType','positionTitle','unitId'])
            ->keyBy('id');

        return $meetings->map(fn ($m) => [
            ...$m->toArray(),
            'organizer' => $userMap->get($m->organizerId),
            'attendees' => $m->attendees->map(fn ($a) => [
                ...$a->toArray(),
                'user' => $userMap->get($a->userId),
                'delegateTo' => $a->delegateToId ? $userMap->get($a->delegateToId) : null,
            ])->values()->all(),
        ])->values()->all();
    }

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $meetings = $this->queryMeetings($request);
        if ($request->expectsJson()) {
            return response()->json(['data' => $meetings, 'total' => count($meetings)]);
        }

        return Inertia::render('MeetingsView', [
            'meetings' => $meetings,
            'filters' => $request->only(['filter', 'from', 'to', 'forUserId']),
        ]);
    }

    public function show(Request $request, int $id)
    {
        $meeting = Meeting::with('attendees', 'decisions', 'actionItems')->findOrFail($id);
        $this->assertAccess($meeting, $request->user()->id, $request->user()->roleType);
        $enriched = $this->enrichMeetings(collect([$meeting]))[0];
        if ($request->expectsJson()) {
            return response()->json(['data' => $enriched]);
        }

        return Inertia::render('MeetingDetailView', ['meeting' => $enriched]);
    }

    // ── JSON endpoints ────────────────────────────────────────────────────────

    public function decisions(Request $request)
    {
        $q = $request->query('q');
        $userId = $request->user()->id;
        $role = $request->user()->roleType;

        $query = MeetingDecision::query()
            ->with('meeting:id,title,startAt,meetingType')
            ->orderBy('createdAt', 'desc')
            ->limit(50);

        if ($q) $query->where('decision', 'ilike', "%{$q}%");

        if (!$this->canSeeAll($role)) {
            $query->whereHas('meeting', fn ($q2) => $q2->where(fn ($q3) => $q3
                ->where('organizerId', $userId)
                ->orWhereHas('attendees', fn ($q4) => $q4->where('userId', $userId))
            ));
        }

        $decisions = $query->get();
        $userIds = $decisions->pluck('decidedBy')->unique();
        $userMap = User::whereIn('id', $userIds)->get(['id','name','roleType'])->keyBy('id');

        return response()->json([
            'data' => $decisions->map(fn ($d) => [
                ...$d->toArray(),
                'decidedByUser' => $userMap->get($d->decidedBy),
            ])->values()->all(),
        ]);
    }

    public function suggestions(Request $request)
    {
        $user = $request->user();
        $userId = $user->id;
        $orgScope = OrgScope::forUser($user);
        $role = $orgScope->role;
        // STAF/OFFICER/ASISTEN see only their owned at-risk programs (personal queue).
        // KADIV/KASUBDIV see at-risk programs in their org scope (managerial queue).
        // BOD/ADMIN see portfolio-wide.
        $personalOnly = !$orgScope->isExecutive && !in_array($role, ['KADIV', 'KASUBDIV'], true);

        $programs = Program::query()
            ->whereIn('healthStatus', ['RED', 'YELLOW'])
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->when($personalOnly, fn ($q) => $q->where('ownerId', $userId))
            ->when(!$orgScope->isExecutive && !$personalOnly,
                fn ($q) => $q->whereIn('ownerUnitId', $orgScope->unitIds ?: [0]))
            ->select('id','name','code','healthStatus','progressPercent','ownerId')
            ->orderByRaw('CASE "healthStatus" WHEN \'RED\' THEN 1 WHEN \'YELLOW\' THEN 2 ELSE 3 END')
            ->orderBy('progressPercent')
            ->limit(10)
            ->get();

        $cutoff = now()->subDays(14);
        $suggestions = $programs->map(function ($prog) use ($cutoff) {
            $lastRecent = Meeting::where('linkedProgramId', $prog->id)
                ->where('status', '!=', 'CANCELLED')
                ->where('startAt', '>=', $cutoff)
                ->exists();

            if ($lastRecent) return null;

            $criticalBlockers = Blocker::query()
                ->whereIn('severity', ['CRITICAL', 'HIGH'])
                ->where('status', '!=', 'RESOLVED')
                ->whereHas('task.workstream', fn ($q) => $q->where('programId', $prog->id))
                ->count();

            $lastMeeting = Meeting::where('linkedProgramId', $prog->id)
                ->where('status', '!=', 'CANCELLED')
                ->orderBy('startAt', 'desc')
                ->value('startAt');

            $daysSince = $lastMeeting ? (int) floor(now()->diffInDays($lastMeeting)) : null;

            return [
                'type' => $prog->healthStatus === 'RED' ? 'PROGRAM_HEALTH' : ($criticalBlockers >= 3 ? 'BLOCKER_ESCALATION' : 'PROGRAM_HEALTH'),
                'programId' => $prog->id,
                'programName' => $prog->name,
                'programCode' => $prog->code,
                'programHealth' => $prog->healthStatus,
                'progressPercent' => $prog->progressPercent,
                'criticalBlockerCount' => $criticalBlockers,
                'daysSinceLastMeeting' => $daysSince,
                'suggestedType' => $prog->healthStatus === 'RED' ? 'RAPAT_KOORDINASI' : 'RAPAT_DIVISI',
                'suggestedTitle' => $prog->healthStatus === 'RED' ? "Eskalasi: {$prog->name}" : "Review: {$prog->name}",
            ];
        })->filter()->values();

        return response()->json(['data' => $suggestions]);
    }

    public function continuity(Request $request, int $id)
    {
        $meeting = Meeting::with('attendees:meetingId,userId')->findOrFail($id);
        $this->assertAccess($meeting, $request->user()->id, $request->user()->roleType);

        return response()->json(['data' => $this->buildContinuity($meeting)]);
    }

    /**
     * Sprint 3 — PICA Composite View Context.
     *
     * Endpoint untuk panel PICA di MeetingDetail. Hanya relevan untuk meeting
     * bertipe RAPAT_KOORDINASI dengan linkedProgramId.
     *
     * Return composite dari 3 sumber existing (tidak ada storage baru):
     *   - openBlockers       : Problem + Issue (rootCause) + Countermeasure (resolution)
     *   - latestProgressLog  : narrative + kendala + dukunganDibutuhkan
     *   - continuity         : action items unresolved dari rapat sebelumnya
     */
    public function picaContext(Request $request, int $id): JsonResponse
    {
        $meeting = Meeting::with('attendees:meetingId,userId')->findOrFail($id);
        $this->assertAccess($meeting, $request->user()->id, $request->user()->roleType);

        if (!$meeting->linkedProgramId) {
            return response()->json([
                'data' => null,
                'note' => 'Meeting tidak ter-link ke program. Panel PICA hanya relevan untuk RAPAT_KOORDINASI dengan linked program.',
            ]);
        }

        $programId = $meeting->linkedProgramId;

        // 1. Open Blockers — via task.workstream.programId
        // Eager load: task + assignee + creator (untuk render row PICA)
        $blockers = Blocker::query()
            ->whereHas('task.workstream', fn ($q) => $q->where('programId', $programId))
            ->whereNotIn('status', ['RESOLVED'])
            ->with([
                'task:id,title,initiativeId',
                'assignee:id,name,roleType,positionTitle',
                'creator:id,name',
            ])
            ->orderByRaw("CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END")
            ->orderBy('createdAt')
            ->limit(50)
            ->get([
                'id', 'code', 'title', 'description', 'severity', 'status',
                'rootCause', 'resolution', 'workItemId', 'assignedTo',
                'createdBy', 'createdAt', 'updatedAt',
            ]);

        // 2. Latest progress log — periode terbaru
        $latestLog = \App\Models\ProgramProgressLog::query()
            ->where('programId', $programId)
            ->orderByDesc('createdAt')
            ->first(['id', 'period', 'healthAtTime', 'narrative', 'kendala', 'correctiveAction', 'nextStep', 'dukunganDibutuhkan', 'createdById', 'createdByName', 'createdAt']);

        // 3. Continuity — re-use logic dari continuity() method
        $continuity = $this->buildContinuity($meeting);

        return response()->json([
            'data' => [
                'openBlockers' => $blockers,
                'latestProgressLog' => $latestLog,
                'continuity' => $continuity,
            ],
        ]);
    }

    /** Helper: build continuity payload (extracted dari continuity() method). */
    private function buildContinuity(Meeting $meeting): array
    {
        $prevMeeting = Meeting::query()
            ->where('id', '!=', $meeting->id)
            ->where('startAt', '<', $meeting->startAt)
            ->whereIn('status', ['COMPLETED', 'SCHEDULED', 'ONGOING'])
            ->where(fn ($q) => $meeting->linkedProgramId
                ? $q->where('linkedProgramId', $meeting->linkedProgramId)
                : $q->where('meetingType', $meeting->meetingType)->where('organizerId', $meeting->organizerId)
            )
            ->orderBy('startAt', 'desc')
            ->first(['id', 'title', 'startAt']);

        if (!$prevMeeting) {
            return ['previousMeeting' => null, 'unresolvedItems' => [], 'completionRate' => null, 'totalItems' => 0];
        }

        $allItems = MeetingActionItem::where('meetingId', $prevMeeting->id)->orderBy('createdAt')->get();
        $unresolved = $allItems->where('status', '!=', 'COMPLETED')->values();
        $completionRate = $allItems->isNotEmpty()
            ? (int) round(($allItems->count() - $unresolved->count()) / $allItems->count() * 100)
            : null;

        $assignedIds = $unresolved->pluck('assignedToId')->filter()->unique();
        $userMap = User::whereIn('id', $assignedIds)->get(['id', 'name', 'avatarUrl', 'roleType'])->keyBy('id');

        return [
            'previousMeeting' => $prevMeeting,
            'unresolvedItems' => $unresolved->map(fn ($i) => [
                ...$i->toArray(),
                'assignedTo' => $i->assignedToId ? $userMap->get($i->assignedToId) : null,
            ])->values()->all(),
            'completionRate' => $completionRate,
            'totalItems' => $allItems->count(),
        ];
    }

    public function listActionItems(Request $request, int $id)
    {
        $meeting = Meeting::with('attendees:meetingId,userId')->findOrFail($id);
        $this->assertAccess($meeting, $request->user()->id, $request->user()->roleType);

        $items = MeetingActionItem::where('meetingId', $id)->orderBy('createdAt')->get();
        $userMap = User::whereIn('id', $items->pluck('assignedToId')->filter()->unique())
            ->get(['id','name','avatarUrl','roleType'])->keyBy('id');

        return response()->json([
            'data' => $items->map(fn ($i) => [
                ...$i->toArray(),
                'assignedTo' => $i->assignedToId ? $userMap->get($i->assignedToId) : null,
            ])->values()->all(),
        ]);
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'title' => 'required|string|min:3|max:120',
            'description' => 'nullable|string|max:400',
            'meetingType' => 'in:RAPAT_DIREKSI,RAPAT_KOORDINASI,RAPAT_DIVISI,RAPAT_TIM,ONE_ON_ONE',
            'startAt' => 'required|date',
            'endAt' => 'required|date|after:startAt',
            'location' => 'nullable|string|max:200',
            'linkedProgramId' => 'nullable|integer',
            'attendees' => 'array',
            'attendees.*.userId' => 'integer',
            'attendees.*.attendeeRole' => 'in:REQUIRED,OPTIONAL',
        ]);

        $organizerId = $request->user()->id;
        $attendees = collect($data['attendees'] ?? [])
            ->unique('userId')
            ->take(101);

        if ($attendees->where('userId', '!=', $organizerId)->count() > 100) {
            return $this->validationError($request, 'Maksimal 100 peserta per meeting.');
        }

        $meeting = DB::transaction(function () use ($data, $organizerId, $attendees) {
            $meeting = Meeting::create([
                'title' => trim($data['title']),
                'description' => trim($data['description'] ?? ''),
                'meetingType' => $data['meetingType'] ?? 'RAPAT_TIM',
                'startAt' => $data['startAt'],
                'endAt' => $data['endAt'],
                'location' => trim($data['location'] ?? ''),
                'organizerId' => $organizerId,
                'linkedProgramId' => $data['linkedProgramId'] ?? null,
                'status' => 'SCHEDULED',
            ]);

            // Organizer auto-added as HADIR
            MeetingAttendee::create([
                'meetingId' => $meeting->id,
                'userId' => $organizerId,
                'attendeeRole' => 'ORGANIZER',
                'rsvpStatus' => 'HADIR',
                'respondedAt' => now(),
            ]);

            foreach ($attendees->where('userId', '!=', $organizerId) as $a) {
                MeetingAttendee::create([
                    'meetingId' => $meeting->id,
                    'userId' => $a['userId'],
                    'attendeeRole' => $a['attendeeRole'] ?? 'REQUIRED',
                    'rsvpStatus' => 'PENDING',
                ]);
            }

            return $meeting;
        });

        rescue(function () use ($meeting, $organizerId) {
            $inviteeIds = $meeting->attendees()->where('userId', '!=', $organizerId)->pluck('userId')->all();
            $when = $meeting->startAt->format('d M Y H:i');
            $this->notifyMeetingUsers(
                $inviteeIds,
                'MEETING_INVITED',
                "Anda diundang ke meeting \"{$meeting->title}\" pada {$when}.",
                $meeting->id,
            );
        });

        if ($request->expectsJson()) {
            return response()->json(['data' => $meeting->fresh(['attendees'])], 201);
        }

        return redirect()->route('meetings.show', $meeting->id)->with('success', 'Meeting dijadwalkan.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $userId = $request->user()->id;

        if ($meeting->organizerId !== $userId) {
            abort(403, 'Hanya organizer yang dapat mengubah meeting.');
        }

        $data = $request->validate([
            'title' => 'sometimes|string|min:3|max:120',
            'description' => 'nullable|string|max:400',
            'meetingType' => 'sometimes|in:RAPAT_DIREKSI,RAPAT_KOORDINASI,RAPAT_DIVISI,RAPAT_TIM,ONE_ON_ONE',
            'startAt' => 'sometimes|date',
            'endAt' => 'sometimes|date',
            'location' => 'nullable|string|max:200',
            'notes' => 'nullable|string|max:8000',
            'linkedProgramId' => 'nullable|integer',
            'status' => 'sometimes|in:SCHEDULED,ONGOING,COMPLETED,CANCELLED,POSTPONED',
            'postponedReason' => 'nullable|string|max:300',
        ]);

        // Status transition guards
        if (!empty($data['status'])) {
            $status = $data['status'];
            $now = now();

            if ($status === 'ONGOING' && $meeting->status !== 'SCHEDULED') {
                return $this->validationError($request, 'Hanya meeting berstatus Terjadwal yang dapat dimulai.');
            }
            if ($status === 'ONGOING') {
                $earliest = $meeting->startAt->subMinutes(15);
                if ($now->lt($earliest)) return $this->validationError($request, 'Meeting belum bisa dimulai — terlalu awal (maks 15 menit sebelum jadwal).');
            }
            if ($status === 'COMPLETED' && !in_array($meeting->status, ['SCHEDULED', 'ONGOING'], true)) {
                return $this->validationError($request, 'Meeting hanya dapat diselesaikan dari status Terjadwal atau Berlangsung.');
            }
            if ($status === 'POSTPONED') {
                if (!in_array($meeting->status, ['SCHEDULED', 'ONGOING'], true)) {
                    return $this->validationError($request, 'Hanya meeting Terjadwal/Berlangsung yang dapat ditunda.');
                }
                if (empty($data['postponedReason'])) {
                    return $this->validationError($request, 'Alasan penundaan wajib diisi.');
                }
            }
            if ($status === 'SCHEDULED' && $meeting->status !== 'POSTPONED') {
                return $this->validationError($request, 'Hanya meeting Ditunda yang dapat dijadwalkan ulang.');
            }
            if ($status === 'CANCELLED' && $meeting->status === 'COMPLETED') {
                return $this->validationError($request, 'Meeting yang sudah selesai tidak dapat dibatalkan.');
            }
        }

        $updateData = array_filter([
            'title' => isset($data['title']) ? trim($data['title']) : null,
            'description' => isset($data['description']) ? trim($data['description'] ?? '') : null,
            'meetingType' => $data['meetingType'] ?? null,
            'location' => isset($data['location']) ? trim($data['location'] ?? '') : null,
            'notes' => isset($data['notes']) ? trim($data['notes'] ?? '') : null,
            'linkedProgramId' => $data['linkedProgramId'] ?? null,
            'status' => $data['status'] ?? null,
        ], fn ($v) => !is_null($v));

        if (isset($data['startAt'])) {
            // Track reschedule
            if (!$meeting->rescheduledFromAt) $updateData['rescheduledFromAt'] = $meeting->startAt;
            $updateData['startAt'] = $data['startAt'];
        }
        if (isset($data['endAt'])) $updateData['endAt'] = $data['endAt'];
        if (!empty($data['postponedReason'])) $updateData['postponedReason'] = trim($data['postponedReason']);
        if (($data['status'] ?? null) === 'SCHEDULED') $updateData['postponedReason'] = null;

        $prevStartAt = $meeting->startAt;
        $prevEndAt = $meeting->endAt;
        $prevStatus = $meeting->status;

        DB::transaction(function () use ($meeting, $updateData, $data) {
            // Optimistic concurrency check for status transitions
            if (!empty($data['status'])) {
                $fresh = Meeting::where('id', $meeting->id)->value('status');
                if ($fresh !== $meeting->status) {
                    abort(409, 'Status meeting telah berubah. Silakan refresh dan coba lagi.');
                }
            }
            $meeting->update($updateData);
        });

        rescue(function () use ($meeting, $updateData, $prevStartAt, $prevEndAt, $prevStatus) {
            $meeting->refresh();
            $attendeeIds = $meeting->attendees()->where('userId', '!=', $meeting->organizerId)->pluck('userId')->all();
            if (empty($attendeeIds)) return;

            $newStatus = $updateData['status'] ?? $prevStatus;
            if ($newStatus !== $prevStatus) {
                if ($newStatus === 'CANCELLED') {
                    $this->notifyMeetingUsers($attendeeIds, 'MEETING_CANCELLED', "Meeting \"{$meeting->title}\" dibatalkan.", $meeting->id);
                    return;
                }
                if ($newStatus === 'POSTPONED') {
                    $reason = $meeting->postponedReason ? " Alasan: {$meeting->postponedReason}" : '';
                    $this->notifyMeetingUsers($attendeeIds, 'MEETING_POSTPONED', "Meeting \"{$meeting->title}\" ditunda.{$reason}", $meeting->id);
                    return;
                }
            }

            $rescheduled = (isset($updateData['startAt']) && (string) $meeting->startAt !== (string) $prevStartAt)
                || (isset($updateData['endAt']) && (string) $meeting->endAt !== (string) $prevEndAt);
            if ($rescheduled) {
                $when = $meeting->startAt->format('d M Y H:i');
                $this->notifyMeetingUsers($attendeeIds, 'MEETING_UPDATED', "Meeting \"{$meeting->title}\" dijadwalkan ulang ke {$when}.", $meeting->id);
            }
        });

        if ($request->expectsJson()) {
            return response()->json(['data' => $meeting->fresh(['attendees', 'decisions', 'actionItems'])]);
        }

        return back()->with('success', 'Meeting diperbarui.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $user = $request->user();

        if ($meeting->organizerId !== $user->id && !$this->canSeeAll($user->roleType)) {
            abort(403, 'Hanya organizer yang dapat membatalkan meeting.');
        }
        if ($meeting->status === 'COMPLETED') {
            return $this->validationError($request, 'Meeting yang sudah selesai tidak dapat dibatalkan.');
        }

        $meeting->update(['status' => 'CANCELLED']);

        rescue(function () use ($meeting) {
            $attendeeIds = $meeting->attendees()->where('userId', '!=', $meeting->organizerId)->pluck('userId')->all();
            $this->notifyMeetingUsers($attendeeIds, 'MEETING_CANCELLED', "Meeting \"{$meeting->title}\" dibatalkan.", $meeting->id);
        });

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('meetings.index')->with('success', 'Meeting dibatalkan.');
    }

    public function rsvp(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $userId = $request->user()->id;

        if ($meeting->isTerminal()) {
            return $this->validationError($request, 'Tidak dapat RSVP untuk meeting yang sudah ' . ($meeting->status === 'CANCELLED' ? 'dibatalkan' : 'selesai') . '.');
        }
        if ($meeting->status === 'POSTPONED') {
            return $this->validationError($request, 'Tidak dapat RSVP untuk meeting yang sedang ditunda.');
        }

        $data = $request->validate([
            'rsvpStatus' => 'required|in:HADIR,TIDAK_HADIR,DELEGASI',
            'delegateToId' => 'nullable|integer',
            'delegateNote' => 'nullable|string|max:200',
        ]);

        if ($data['rsvpStatus'] === 'DELEGASI') {
            if (empty($data['delegateToId'])) return $this->validationError($request, 'delegateToId wajib untuk DELEGASI.');
            if ($data['delegateToId'] === $userId) return $this->validationError($request, 'Tidak dapat mendelegasikan kepada diri sendiri.');
            $delegateUser = User::where('id', $data['delegateToId'])->where('isActive', true)->first();
            if (!$delegateUser) return $this->validationError($request, 'User delegasi tidak ditemukan atau tidak aktif.');
        }

        $attendee = MeetingAttendee::where('meetingId', $id)->where('userId', $userId)->first();
        if (!$attendee) return $this->validationError($request, 'Anda tidak diundang ke meeting ini.');
        if ($attendee->attendeeRole === 'ORGANIZER') return $this->validationError($request, 'Organizer tidak perlu RSVP.');

        $attendee->update([
            'rsvpStatus' => $data['rsvpStatus'],
            'delegateToId' => $data['rsvpStatus'] === 'DELEGASI' ? $data['delegateToId'] : null,
            'delegateNote' => $data['rsvpStatus'] === 'DELEGASI' ? ($data['delegateNote'] ?? null) : null,
            'respondedAt' => now(),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $attendee->fresh()]);
        }

        return back()->with('success', 'RSVP disimpan.');
    }

    public function addAttendee(Request $request, int $id): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        if ($meeting->organizerId !== $request->user()->id) abort(403, 'Hanya organizer yang dapat menambah peserta.');

        $data = $request->validate([
            'userId' => 'required|integer',
            'attendeeRole' => 'in:REQUIRED,OPTIONAL',
        ]);

        $attendee = MeetingAttendee::updateOrCreate(
            ['meetingId' => $id, 'userId' => $data['userId']],
            ['attendeeRole' => $data['attendeeRole'] ?? 'REQUIRED', 'rsvpStatus' => 'PENDING'],
        );

        if ($attendee->wasRecentlyCreated) {
            rescue(function () use ($meeting, $data) {
                $when = $meeting->startAt->format('d M Y H:i');
                $this->notifyMeetingUsers([(int) $data['userId']], 'MEETING_INVITED', "Anda diundang ke meeting \"{$meeting->title}\" pada {$when}.", $meeting->id);
            });
        }

        return back()->with('success', 'Peserta ditambahkan.');
    }

    public function removeAttendee(Request $request, int $id, int $userId): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        if ($meeting->organizerId !== $request->user()->id) abort(403, 'Hanya organizer yang dapat menghapus peserta.');
        MeetingAttendee::where('meetingId', $id)->where('userId', $userId)->delete();
        return back()->with('success', 'Peserta dihapus.');
    }

    public function addDecision(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $data = $request->validate(['decision' => 'required|string|min:3|max:600']);
        $decision = MeetingDecision::create([
            'meetingId' => $id,
            'decision' => $data['decision'],
            'decidedBy' => $request->user()->id,
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $decision], 201);
        }

        return back()->with('success', 'Keputusan ditambahkan.');
    }

    public function destroyDecision(Request $request, int $id, int $decisionId): JsonResponse|RedirectResponse
    {
        MeetingDecision::where('meetingId', $id)->where('id', $decisionId)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Keputusan dihapus.');
    }

    public function storeActionItem(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $userId = $request->user()->id;

        if ($meeting->organizerId !== $userId) abort(403, 'Hanya organizer yang dapat menambah action item.');
        if (in_array($meeting->status, ['CANCELLED', 'COMPLETED', 'POSTPONED'], true)) {
            return $this->validationError($request, 'Tidak dapat menambah action item ke meeting yang ditunda, dibatalkan, atau selesai.');
        }
        if (MeetingActionItem::where('meetingId', $id)->count() >= 100) {
            return $this->validationError($request, 'Batas action item per meeting tercapai (maksimal 100).');
        }

        $data = $request->validate([
            'title' => 'required|string|min:3|max:200',
            'description' => 'nullable|string|max:400',
            'assignedToId' => 'nullable|integer',
            'dueDate' => 'nullable|date|after_or_equal:today',
        ]);

        if (!empty($data['assignedToId'])) {
            $isOrganizer = $meeting->organizerId === $data['assignedToId'];
            $attendee = $isOrganizer ? null : MeetingAttendee::where('meetingId', $id)->where('userId', $data['assignedToId'])->first();
            if (!$isOrganizer && !$attendee) return $this->validationError($request, 'User yang di-assign harus merupakan peserta meeting ini.');
            if ($attendee && in_array($attendee->rsvpStatus, ['TIDAK_HADIR', 'DELEGASI'], true)) {
                return $this->validationError($request, 'Tidak dapat assign action item ke peserta yang tidak hadir atau mendelegasikan.');
            }
        }

        $item = MeetingActionItem::create([...$data, 'meetingId' => $id, 'title' => trim($data['title']), 'status' => 'OPEN']);

        if (!empty($data['assignedToId']) && (int) $data['assignedToId'] !== (int) $userId) {
            rescue(function () use ($meeting, $item, $data) {
                $due = !empty($data['dueDate']) ? ' (deadline ' . \Illuminate\Support\Carbon::parse($data['dueDate'])->format('d M Y') . ')' : '';
                $this->notifyMeetingUsers([(int) $data['assignedToId']], 'ACTION_ITEM_ASSIGNED', "Action item baru di meeting \"{$meeting->title}\": {$item->title}{$due}.", $meeting->id);
            });
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $item], 201);
        }

        return back()->with('success', 'Action item ditambahkan.');
    }

    public function updateActionItem(Request $request, int $id, int $itemId): JsonResponse|RedirectResponse
    {
        $item = MeetingActionItem::where('meetingId', $id)->findOrFail($itemId);
        $meeting = Meeting::find($id);
        $userId = $request->user()->id;

        $isOrganizer = $meeting?->organizerId === $userId;
        $isAssigned = $item->assignedToId === $userId;
        if (!$isOrganizer && !$isAssigned) abort(403, 'Tidak memiliki akses.');

        $data = $request->validate([
            'title' => 'sometimes|string|min:3|max:200',
            'status' => 'sometimes|in:OPEN,IN_PROGRESS,COMPLETED',
            'assignedToId' => 'nullable|integer',
            'dueDate' => 'nullable|date',
        ]);

        if (isset($data['status']) && $data['status'] === 'COMPLETED') {
            $data['completedAt'] = now();
        }

        $prevAssignee = $item->assignedToId;
        $prevStatus = $item->status;
        $item->update($data);

        if (array_key_exists('assignedToId', $data) && $data['assignedToId'] && (int) $data['assignedToId'] !== (int) $prevAssignee && (int) $data['assignedToId'] !== (int) $userId) {
            rescue(function () use ($meeting, $item, $data) {
                $due = !empty($data['dueDate']) ? ' (deadline ' . \Illuminate\Support\Carbon::parse($data['dueDate'])->format('d M Y') . ')' : '';
                $title = $meeting?->title ?? 'meeting';
                $this->notifyMeetingUsers([(int) $data['assignedToId']], 'ACTION_ITEM_ASSIGNED', "Action item di meeting \"{$title}\" di-assign ke Anda: {$item->title}{$due}.", $meeting?->id ?? 0);
            });
        }

        // Isu #11 — Act→Do close-loop: action item COMPLETED + linked ke
        // WorkItem → auto-mark task COMPLETED. One-way only (reopen action
        // item tidak revert task) supaya progress manual user tidak hilang.
        // Skip task yg sudah COMPLETED atau CANCELLED (jangan override state
        // eksplisit).
        if (
            isset($data['status'])
            && $data['status'] === 'COMPLETED'
            && $prevStatus !== 'COMPLETED'
            && $item->linkedWorkItemId !== null
        ) {
            rescue(function () use ($item, $userId) {
                $task = Task::find($item->linkedWorkItemId);
                if (!$task) return;
                if (in_array($task->status, ['COMPLETED', 'CANCELLED'], true)) return;

                $task->update([
                    'status'           => 'COMPLETED',
                    'percentComplete'  => 100,
                    'actualCompletion' => now(),
                ]);

                $assigneeId = (int) ($task->assignedTo ?? 0);
                $creatorId  = (int) ($task->createdBy ?? 0);
                $notifyIds  = array_values(array_unique(array_filter(
                    [$assigneeId, $creatorId],
                    fn ($id) => $id > 0 && $id !== (int) $userId
                )));

                // Broadcast realtime — WorkboardView / ProgramDetail
                // Eksekusi tab auto-refresh tanpa user perlu reload.
                BroadcastService::toUsers('task:updated', [
                    'task'                 => $task->fresh(),
                    'source'               => 'meeting-action-item',
                    'meetingActionItemId'  => $item->id,
                ], array_values(array_unique(array_filter(
                    [$assigneeId, $creatorId],
                    fn ($id) => $id > 0
                ))));

                // Notif personal ke assignee + creator task (kecuali closer-nya).
                if (!empty($notifyIds)) {
                    foreach ($notifyIds as $uid) {
                        $notif = Notification::create([
                            'userId'    => $uid,
                            'type'      => 'TASK_COMPLETED_VIA_ACTION_ITEM',
                            'message'   => "Task {$task->code} \"{$task->title}\" otomatis diselesaikan via meeting action item.",
                            'source'    => "meeting-action-item:{$item->id}",
                            'createdAt' => now(),
                            'state'     => 'UNREAD',
                        ]);
                        BroadcastService::toUsers('notification:created', [
                            'notification' => $notif,
                        ], [$uid]);
                    }
                }
            });
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $item->fresh()]);
        }

        return back()->with('success', 'Action item diperbarui.');
    }

    public function destroyActionItem(Request $request, int $id, int $itemId): JsonResponse|RedirectResponse
    {
        $item = MeetingActionItem::where('meetingId', $id)->findOrFail($itemId);
        $meeting = Meeting::find($id);
        $userId = $request->user()->id;

        if ($meeting?->organizerId !== $userId && !RolePolicy::isAdminOrAbove($request->user()->roleType)) {
            abort(403, 'Hanya organizer yang dapat menghapus action item.');
        }

        $item->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Action item dihapus.');
    }

    // ── Private query helper ──────────────────────────────────────────────────

    private function queryMeetings(Request $request): array
    {
        $userId = $request->user()->id;
        $role = $request->user()->roleType;
        $filter = $request->query('filter', 'upcoming');
        $from = $request->query('from');
        $to = $request->query('to');
        $forUserId = $request->query('forUserId');
        $now = now();

        // Date filter
        $dateWhere = [];
        if ($from || $to) {
            $dateWhere = $from && $to
                ? [['startAt', '>=', $from], ['startAt', '<=', $to]]
                : ($from ? [['startAt', '>=', $from]] : [['startAt', '<=', $to]]);
        } elseif ($filter === 'past') {
            $dateWhere = [['endAt', '<', $now]];
        } elseif ($filter === 'upcoming') {
            // handled via orWhere below
        }

        $query = Meeting::with('attendees')->orderBy('startAt');

        foreach ($dateWhere as $cond) {
            $query->where(...$cond);
        }

        if (!$from && !$to && $filter === 'upcoming') {
            $query->where(fn ($q) => $q
                ->where('startAt', '>=', $now->clone()->subHours(2))
                ->orWhere('status', 'POSTPONED')
            );
        }

        if ($forUserId) {
            $targetId = (int) $forUserId;
            $query->where('status', '!=', 'CANCELLED')
                ->where(fn ($q) => $q
                    ->where('organizerId', $targetId)
                    ->orWhereHas('attendees', fn ($q2) => $q2->where('userId', $targetId))
                );
        } elseif (!$this->canSeeAll($role)) {
            $query->where(fn ($q) => $q
                ->where('organizerId', $userId)
                ->orWhereHas('attendees', fn ($q2) => $q2->where('userId', $userId))
            );
        }

        $meetings = $query->limit(500)->get();
        return $this->enrichMeetings($meetings);
    }
}
