<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\Meeting;
use App\Models\MeetingActionItem;
use App\Models\MeetingAttendee;
use App\Models\MeetingDecision;
use App\Models\Program;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class MeetingController extends Controller
{
    // ── Helpers ───────────────────────────────────────────────────────────────

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
        $userId = $request->user()->id;
        $role = $request->user()->roleType;
        $isStrategic = in_array(strtoupper($role), ['BOD', 'KADIV', 'ADMIN', 'SUPERADMIN'], true);

        $programWhere = fn ($q) => $q
            ->whereIn('healthStatus', ['RED', 'YELLOW'])
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED']);

        if (!$isStrategic) {
            $programWhere = fn ($q) => $q
                ->whereIn('healthStatus', ['RED', 'YELLOW'])
                ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
                ->where('ownerId', $userId);
        }

        $programs = Program::where($programWhere)
            ->select('id','name','code','healthStatus','progressPercent','ownerId')
            ->orderByRaw("CASE healthStatus WHEN 'RED' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END")
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

        $prevMeeting = Meeting::query()
            ->where('id', '!=', $id)
            ->where('startAt', '<', $meeting->startAt)
            ->whereIn('status', ['COMPLETED', 'SCHEDULED', 'ONGOING'])
            ->where(fn ($q) => $meeting->linkedProgramId
                ? $q->where('linkedProgramId', $meeting->linkedProgramId)
                : $q->where('meetingType', $meeting->meetingType)->where('organizerId', $meeting->organizerId)
            )
            ->orderBy('startAt', 'desc')
            ->first(['id','title','startAt']);

        if (!$prevMeeting) {
            return response()->json(['data' => ['previousMeeting' => null, 'unresolvedItems' => [], 'completionRate' => null]]);
        }

        $allItems = MeetingActionItem::where('meetingId', $prevMeeting->id)->orderBy('createdAt')->get();
        $unresolved = $allItems->where('status', '!=', 'COMPLETED')->values();
        $completionRate = $allItems->isNotEmpty()
            ? (int) round(($allItems->count() - $unresolved->count()) / $allItems->count() * 100)
            : null;

        $assignedIds = $unresolved->pluck('assignedToId')->filter()->unique();
        $userMap = User::whereIn('id', $assignedIds)->get(['id','name','avatarUrl','roleType'])->keyBy('id');

        return response()->json(['data' => [
            'previousMeeting' => $prevMeeting,
            'unresolvedItems' => $unresolved->map(fn ($i) => [
                ...$i->toArray(),
                'assignedTo' => $i->assignedToId ? $userMap->get($i->assignedToId) : null,
            ])->values()->all(),
            'completionRate' => $completionRate,
            'totalItems' => $allItems->count(),
        ]]);
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

    public function store(Request $request): RedirectResponse
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
            return back()->withErrors(['Maksimal 100 peserta per meeting.']);
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

        return redirect()->route('meetings.show', $meeting->id)->with('success', 'Meeting dijadwalkan.');
    }

    public function update(Request $request, int $id): RedirectResponse
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
                return back()->withErrors(['Hanya meeting berstatus Terjadwal yang dapat dimulai.']);
            }
            if ($status === 'ONGOING') {
                $earliest = $meeting->startAt->subMinutes(15);
                if ($now->lt($earliest)) return back()->withErrors(['Meeting belum bisa dimulai — terlalu awal (maks 15 menit sebelum jadwal).']);
            }
            if ($status === 'COMPLETED' && !in_array($meeting->status, ['SCHEDULED', 'ONGOING'], true)) {
                return back()->withErrors(['Meeting hanya dapat diselesaikan dari status Terjadwal atau Berlangsung.']);
            }
            if ($status === 'POSTPONED') {
                if (!in_array($meeting->status, ['SCHEDULED', 'ONGOING'], true)) {
                    return back()->withErrors(['Hanya meeting Terjadwal/Berlangsung yang dapat ditunda.']);
                }
                if (empty($data['postponedReason'])) {
                    return back()->withErrors(['Alasan penundaan wajib diisi.']);
                }
            }
            if ($status === 'SCHEDULED' && $meeting->status !== 'POSTPONED') {
                return back()->withErrors(['Hanya meeting Ditunda yang dapat dijadwalkan ulang.']);
            }
            if ($status === 'CANCELLED' && $meeting->status === 'COMPLETED') {
                return back()->withErrors(['Meeting yang sudah selesai tidak dapat dibatalkan.']);
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

        return back()->with('success', 'Meeting diperbarui.');
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $user = $request->user();

        if ($meeting->organizerId !== $user->id && !$this->canSeeAll($user->roleType)) {
            abort(403, 'Hanya organizer yang dapat membatalkan meeting.');
        }
        if ($meeting->status === 'COMPLETED') {
            return back()->withErrors(['Meeting yang sudah selesai tidak dapat dibatalkan.']);
        }

        $meeting->update(['status' => 'CANCELLED']);
        return redirect()->route('meetings.index')->with('success', 'Meeting dibatalkan.');
    }

    public function rsvp(Request $request, int $id): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $userId = $request->user()->id;

        if ($meeting->isTerminal()) {
            return back()->withErrors(['Tidak dapat RSVP untuk meeting yang sudah ' . ($meeting->status === 'CANCELLED' ? 'dibatalkan' : 'selesai') . '.']);
        }
        if ($meeting->status === 'POSTPONED') {
            return back()->withErrors(['Tidak dapat RSVP untuk meeting yang sedang ditunda.']);
        }

        $data = $request->validate([
            'rsvpStatus' => 'required|in:HADIR,TIDAK_HADIR,DELEGASI',
            'delegateToId' => 'nullable|integer',
            'delegateNote' => 'nullable|string|max:200',
        ]);

        if ($data['rsvpStatus'] === 'DELEGASI') {
            if (empty($data['delegateToId'])) return back()->withErrors(['delegateToId wajib untuk DELEGASI.']);
            if ($data['delegateToId'] === $userId) return back()->withErrors(['Tidak dapat mendelegasikan kepada diri sendiri.']);
            $delegateUser = User::where('id', $data['delegateToId'])->where('isActive', true)->first();
            if (!$delegateUser) return back()->withErrors(['User delegasi tidak ditemukan atau tidak aktif.']);
        }

        $attendee = MeetingAttendee::where('meetingId', $id)->where('userId', $userId)->first();
        if (!$attendee) return back()->withErrors(['Anda tidak diundang ke meeting ini.']);
        if ($attendee->attendeeRole === 'ORGANIZER') return back()->withErrors(['Organizer tidak perlu RSVP.']);

        $attendee->update([
            'rsvpStatus' => $data['rsvpStatus'],
            'delegateToId' => $data['rsvpStatus'] === 'DELEGASI' ? $data['delegateToId'] : null,
            'delegateNote' => $data['rsvpStatus'] === 'DELEGASI' ? ($data['delegateNote'] ?? null) : null,
            'respondedAt' => now(),
        ]);

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

        MeetingAttendee::updateOrCreate(
            ['meetingId' => $id, 'userId' => $data['userId']],
            ['attendeeRole' => $data['attendeeRole'] ?? 'REQUIRED', 'rsvpStatus' => 'PENDING'],
        );

        return back()->with('success', 'Peserta ditambahkan.');
    }

    public function removeAttendee(Request $request, int $id, int $userId): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        if ($meeting->organizerId !== $request->user()->id) abort(403, 'Hanya organizer yang dapat menghapus peserta.');
        MeetingAttendee::where('meetingId', $id)->where('userId', $userId)->delete();
        return back()->with('success', 'Peserta dihapus.');
    }

    public function addDecision(Request $request, int $id): RedirectResponse
    {
        $data = $request->validate(['decision' => 'required|string|min:3|max:600']);
        MeetingDecision::create([
            'meetingId' => $id,
            'decision' => $data['decision'],
            'decidedBy' => $request->user()->id,
        ]);
        return back()->with('success', 'Keputusan ditambahkan.');
    }

    public function destroyDecision(int $id, int $decisionId): RedirectResponse
    {
        MeetingDecision::where('meetingId', $id)->where('id', $decisionId)->delete();
        return back()->with('success', 'Keputusan dihapus.');
    }

    public function storeActionItem(Request $request, int $id): RedirectResponse
    {
        $meeting = Meeting::findOrFail($id);
        $userId = $request->user()->id;

        if ($meeting->organizerId !== $userId) abort(403, 'Hanya organizer yang dapat menambah action item.');
        if (in_array($meeting->status, ['CANCELLED', 'COMPLETED', 'POSTPONED'], true)) {
            return back()->withErrors(['Tidak dapat menambah action item ke meeting yang ditunda, dibatalkan, atau selesai.']);
        }
        if (MeetingActionItem::where('meetingId', $id)->count() >= 100) {
            return back()->withErrors(['Batas action item per meeting tercapai (maksimal 100).']);
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
            if (!$isOrganizer && !$attendee) return back()->withErrors(['User yang di-assign harus merupakan peserta meeting ini.']);
            if ($attendee && in_array($attendee->rsvpStatus, ['TIDAK_HADIR', 'DELEGASI'], true)) {
                return back()->withErrors(['Tidak dapat assign action item ke peserta yang tidak hadir atau mendelegasikan.']);
            }
        }

        MeetingActionItem::create([...$data, 'meetingId' => $id, 'title' => trim($data['title']), 'status' => 'OPEN']);
        return back()->with('success', 'Action item ditambahkan.');
    }

    public function updateActionItem(Request $request, int $id, int $itemId): RedirectResponse
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

        $item->update($data);
        return back()->with('success', 'Action item diperbarui.');
    }

    public function destroyActionItem(Request $request, int $id, int $itemId): RedirectResponse
    {
        $item = MeetingActionItem::where('meetingId', $id)->findOrFail($itemId);
        $meeting = Meeting::find($id);
        $userId = $request->user()->id;

        if ($meeting?->organizerId !== $userId && !RolePolicy::isAdminOrAbove($request->user()->roleType)) {
            abort(403, 'Hanya organizer yang dapat menghapus action item.');
        }

        $item->delete();
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
