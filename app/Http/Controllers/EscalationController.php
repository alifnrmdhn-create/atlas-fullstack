<?php

namespace App\Http\Controllers;

use App\Models\EscalationRequest;
use App\Models\Notification;
use App\Models\User;
use App\Services\BroadcastService;
use App\Services\FeatureFlagService;
use App\Services\OrgChainService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Sprint 4 — Clear the Path API.
 *
 * Endpoint untuk create, list, dan disposition (commit/reroute/decline/resolve)
 * escalation request. Semua endpoint cek feature flag clear-the-path per user
 * (DKM-only saat pilot).
 *
 * Notification integration:
 *   - store     → CLEAR_PATH_REQUESTED ke escalatedTo
 *   - commit    → CLEAR_PATH_COMMITTED ke requester
 *   - resolve   → CLEAR_PATH_CLEARED ke requester
 *   - reroute   → CLEAR_PATH_REQUESTED ke target baru
 *   - decline   → CLEAR_PATH_CLEARED (ditolak) ke requester
 */
class EscalationController extends Controller
{
    public function __construct(private OrgChainService $orgChain) {}

    /** Gate semua endpoint dengan feature flag check. */
    private function ensureFeatureEnabled(Request $request): void
    {
        if (!FeatureFlagService::isEnabled('clear-the-path', $request->user())) {
            abort(403, 'The Clear the Path feature is not active for your account yet.');
        }
    }

    // ── List ──────────────────────────────────────────────────────────────────

    /**
     * GET /escalations?filter=mine|incoming|all&status=...
     *   - mine     : escalation yang saya ajukan
     *   - incoming : escalation yang menunggu disposition saya
     *   - all      : (admin only) semua
     */
    public function index(Request $request): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $filter = $request->query('filter', 'incoming');
        $status = $request->query('status');

        $query = EscalationRequest::query()
            ->with([
                'requester:id,name,roleType,positionTitle',
                'escalatedTo:id,name,roleType,positionTitle',
                'reroutedTo:id,name',
                'linkedProgram:id,code,name',
            ])
            ->orderByDesc('createdAt');

        if ($filter === 'mine') {
            $query->where('requestedById', $user->id);
        } elseif ($filter === 'incoming') {
            $query->where('escalatedToId', $user->id);
        } elseif ($filter === 'all' && in_array(strtoupper($user->roleType), ['BOD', 'ADMIN', 'SUPERADMIN'], true)) {
            // no-op (admin sees all)
        } else {
            // Default safety
            $query->where('escalatedToId', $user->id);
        }

        if ($status) $query->where('status', $status);

        $items = $query->limit(100)->get();

        return response()->json([
            'data' => $items,
            'count' => $items->count(),
        ]);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::with([
            'requester:id,name,roleType,positionTitle',
            'escalatedTo:id,name,roleType,positionTitle',
            'reroutedTo:id,name',
            'linkedProgram:id,code,name',
        ])->findOrFail($id);

        $this->assertAccess($user, $req);
        return response()->json(['data' => $req]);
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();

        $data = $request->validate([
            'sourceType'      => 'required|in:BLOCKER,PROGRESS_LOG,ACTION_ITEM,AD_HOC',
            'sourceId'        => 'nullable|integer',
            'title'           => 'required|string|min:3|max:200',
            'description'     => 'nullable|string|max:2000',
            'linkedProgramId' => 'nullable|integer',
            'escalatedToId'   => 'nullable|integer', // optional override; default auto-resolve
        ]);

        // AD_HOC source: sourceId harus null
        if ($data['sourceType'] === 'AD_HOC') {
            $data['sourceId'] = null;
        } elseif (empty($data['sourceId'])) {
            return response()->json([
                'message' => 'sourceId is required for sourceType ' . $data['sourceType'],
                'errors' => ['sourceId' => ['This field is required.']],
            ], 422);
        }

        // Resolve escalation target — default ke atasan langsung
        $targetId = $data['escalatedToId'] ?? null;
        if (!$targetId) {
            $supervisor = $this->orgChain->getDirectSupervisor($user);
            if (!$supervisor) {
                return response()->json([
                    'message' => 'No direct supervisor available for escalation. Please contact an admin.',
                ], 422);
            }
            $targetId = $supervisor->id;
        } else {
            $target = User::find($targetId);
            if (!$target) {
                return response()->json(['message' => 'Target user not found.'], 422);
            }
            if (!$this->orgChain->canEscalateAcrossDirectorate($user, $target)) {
                return response()->json([
                    'message' => 'Cross-directorate escalation is not allowed. Select a supervisor within your directorate.',
                ], 422);
            }
            // Strict per-jenjang: target eksplisit HARUS atasan langsung user —
            // tak boleh lompat (termasuk langsung ke Direktur). Jalur normal (modal)
            // tak mengirim escalatedToId → auto-route ke atasan langsung, aman.
            if (!$this->orgChain->isValidEscalationTarget($user, $target)) {
                return response()->json([
                    'message' => 'Escalation must go one level up — to your direct manager only.',
                ], 422);
            }
        }

        if ($targetId === $user->id) {
            return response()->json(['message' => 'You cannot escalate to yourself.'], 422);
        }

        $req = DB::transaction(function () use ($data, $user, $targetId) {
            $r = EscalationRequest::create([
                ...$data,
                'code' => EscalationRequest::generateCode(),
                'requestedById' => $user->id,
                'escalatedToId' => $targetId,
                'status' => 'REQUESTED',
            ]);

            $this->createNotification($targetId, 'CLEAR_PATH_REQUESTED', $r,
                "{$user->name} requested support: {$r->title}");

            return $r;
        });

        // Eskalasi baru men-suppress item "needs escalation" di Focus (OrgSummaryService
        // ::needsAction lewat activeCoverage). program-summary di-cache 3 menit per-user,
        // jadi bust cache requester supaya nag hilang seketika di SEMUA jalur create —
        // bukan hanya jalur panel Focus (yang sudah bust via disposition REROUTED).
        Cache::forget("program_summary:user:{$user->id}");

        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'reroutedTo', 'linkedProgram'])], 201);
    }

    public function commit(Request $request, int $id): JsonResponse
    {
        return $this->disposition($request, $id, 'COMMITTED', [
            'commitmentDueDate' => 'nullable|date|after_or_equal:today',
            'commitmentNote'    => 'nullable|string|max:1000',
        ]);
    }

    public function reroute(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Only the escalation target can reroute.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status is already final.'], 422);

        $data = $request->validate([
            'reroutedToId' => 'required|integer',
            'commitmentNote' => 'nullable|string|max:500',
        ]);

        // Cegah reroute ke target saat ini (= user ini, lihat guard di atas).
        // Rule `different:escalatedToId` tidak bekerja: escalatedToId bukan field
        // payload, jadi selalu pass → dulu bisa membuat escalation duplikat ke
        // orang yang sama. Bandingkan langsung ke model.
        if ((int) $data['reroutedToId'] === (int) $req->escalatedToId) {
            return response()->json(['message' => 'Cannot reroute to the current target.'], 422);
        }

        // Reroute ke requester asli = escalation yang "ditujukan ke diri sendiri"
        // (requestedById === escalatedToId) → loop no-op. store() sudah mencegah
        // self-escalation; mirror guard-nya di reroute (target = input manual).
        if ((int) $data['reroutedToId'] === (int) $req->requestedById) {
            return response()->json(['message' => 'Cannot reroute back to the original requester.'], 422);
        }

        $newTarget = User::find($data['reroutedToId']);
        if (!$newTarget) {
            return response()->json(['message' => 'Reroute target user not found.'], 422);
        }

        // Apply same cross-direktorat policy yang dipakai store() — requester
        // tetap user asli (bukan yang reroute), supaya tidak bypass policy via reroute.
        $requester = User::find($req->requestedById);
        if ($requester && !$this->orgChain->canEscalateAcrossDirectorate($requester, $newTarget)) {
            return response()->json([
                'message' => 'Cross-directorate reroute is not allowed for the original requester.',
            ], 422);
        }
        // Strict per-jenjang: reroute mendaki SATU tingkat — target HARUS atasan
        // langsung pemegang saat ini ($user), bukan lompat/menyamping. Begini
        // escalation naik bertahap ke Direktur (tiap level melempar ke atasannya).
        if (!$this->orgChain->isValidEscalationTarget($user, $newTarget)) {
            return response()->json([
                'message' => 'Reroute must go one level up — to your direct manager only.',
            ], 422);
        }

        DB::transaction(function () use ($req, $newTarget, $data, $user) {
            $req->update([
                'status' => 'REROUTED',
                'reroutedToId' => $newTarget->id,
                'commitmentNote' => $data['commitmentNote'] ?? null,
                'resolvedAt' => now(),
            ]);

            // Buat escalation baru ke target reroute (chain)
            $newReq = EscalationRequest::create([
                'code' => EscalationRequest::generateCode(),
                'sourceType' => $req->sourceType,
                'sourceId' => $req->sourceId,
                'requestedById' => $req->requestedById,
                'escalatedToId' => $newTarget->id,
                'title' => "[Rerouted from {$user->name}] {$req->title}",
                'description' => $req->description,
                'linkedProgramId' => $req->linkedProgramId,
                'status' => 'REQUESTED',
            ]);

            $newTargetTitle = trim(($newTarget->positionTitle ?? '') ?: '');
            $newTargetLabel = $newTargetTitle !== ''
                ? "{$newTarget->name} ({$newTargetTitle})"
                : $newTarget->name;

            $this->createNotification($newTarget->id, 'CLEAR_PATH_REQUESTED', $newReq,
                "An escalation was rerouted to you from {$user->name}: {$newReq->title}");
            $this->createNotification($req->requestedById, 'CLEAR_PATH_REQUESTED', $newReq,
                "Escalation \"{$req->title}\" was rerouted to {$newTargetLabel}. Click to view the new tracking.");
        });

        // Eager-load arah (from→to) + program supaya panel FE tak kehilangan nama
        // requester/escalatedTo/reroutedTo sesudah aksi (jadi "—"). Konsisten index/show.
        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'reroutedTo', 'linkedProgram'])]);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Only the escalation target can decline.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status is already final.'], 422);

        $data = $request->validate(['declinedReason' => 'required|string|min:5|max:1000']);

        $req->update([
            'status' => 'DECLINED',
            'declinedReason' => $data['declinedReason'],
            'resolvedAt' => now(),
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_CLEARED', $req,
            "Your escalation was declined by {$user->name}: {$data['declinedReason']}");

        // Eager-load arah (from→to) + program supaya panel FE tak kehilangan nama
        // requester/escalatedTo/reroutedTo sesudah aksi (jadi "—"). Konsisten index/show.
        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'reroutedTo', 'linkedProgram'])]);
    }

    public function resolve(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Only the escalation target can resolve.');
        if (!in_array($req->status, ['COMMITTED', 'IN_PROGRESS'], true)) {
            return response()->json(['message' => 'Resolve is only available for requests with status COMMITTED/IN_PROGRESS.'], 422);
        }

        $data = $request->validate(['resolutionNote' => 'required|string|min:5|max:1000']);

        $req->update([
            'status' => 'CLEARED',
            'resolutionNote' => $data['resolutionNote'],
            'resolvedAt' => now(),
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_CLEARED', $req,
            "Blocker cleared by {$user->name}: {$req->title}");

        // Eager-load arah (from→to) + program supaya panel FE tak kehilangan nama
        // requester/escalatedTo/reroutedTo sesudah aksi (jadi "—"). Konsisten index/show.
        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'reroutedTo', 'linkedProgram'])]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function disposition(Request $request, int $id, string $newStatus, array $extraRules): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Only the escalation target can change the disposition.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status is already final.'], 422);
        if ($req->status !== 'REQUESTED') {
            return response()->json(['message' => "The current status ({$req->status}) cannot be changed to {$newStatus}."], 422);
        }

        $data = $request->validate($extraRules);

        $req->update([
            'status' => $newStatus,
            'committedAt' => now(),
            'commitmentDueDate' => $data['commitmentDueDate'] ?? null,
            'commitmentNote' => $data['commitmentNote'] ?? null,
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_COMMITTED', $req,
            "{$user->name} committed to clearing: {$req->title}");

        // Eager-load arah (from→to) + program supaya panel FE tak kehilangan nama
        // requester/escalatedTo/reroutedTo sesudah aksi (jadi "—"). Konsisten index/show.
        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'reroutedTo', 'linkedProgram'])]);
    }

    private function assertAccess(User $user, EscalationRequest $req): void
    {
        if ($req->requestedById === $user->id) return;
        if ($req->escalatedToId === $user->id) return;
        if (in_array(strtoupper($user->roleType), ['BOD', 'ADMIN', 'SUPERADMIN'], true)) return;
        abort(403, 'You do not have access to this escalation.');
    }

    private function createNotification(int $userId, string $type, EscalationRequest $req, string $message): void
    {
        $notif = Notification::create([
            'userId' => $userId,
            'type' => $type,
            'message' => $message,
            'source' => "escalation:{$req->id}",
            'createdAt' => now(),
            'state' => 'UNREAD',
        ]);

        // Frontend handler reads event.notification.id — payload MUST wrap the model row.
        BroadcastService::toUsers('notification:created', [
            'notification' => $notif,
        ], [$userId]);
    }
}
