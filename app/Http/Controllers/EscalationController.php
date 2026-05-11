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
            abort(403, 'Fitur Clear the Path belum aktif untuk akun Anda.');
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
                'message' => 'sourceId wajib untuk sourceType ' . $data['sourceType'],
                'errors' => ['sourceId' => ['Wajib diisi.']],
            ], 422);
        }

        // Resolve escalation target — default ke atasan langsung
        $targetId = $data['escalatedToId'] ?? null;
        if (!$targetId) {
            $supervisor = $this->orgChain->getDirectSupervisor($user);
            if (!$supervisor) {
                return response()->json([
                    'message' => 'Tidak ada atasan langsung untuk eskalasi. Hubungi admin.',
                ], 422);
            }
            $targetId = $supervisor->id;
        } else {
            $target = User::find($targetId);
            if (!$target) {
                return response()->json(['message' => 'User target tidak ditemukan.'], 422);
            }
            if (!$this->orgChain->canEscalateAcrossDirectorate($user, $target)) {
                return response()->json([
                    'message' => 'Tidak diizinkan eskalasi lintas direktorat. Pilih atasan dalam direktorat Anda.',
                ], 422);
            }
        }

        if ($targetId === $user->id) {
            return response()->json(['message' => 'Tidak bisa eskalasi ke diri sendiri.'], 422);
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
                "{$user->name} meminta dukungan: {$r->title}");

            return $r;
        });

        return response()->json(['data' => $req->fresh(['requester', 'escalatedTo', 'linkedProgram'])], 201);
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

        if ($req->escalatedToId !== $user->id) abort(403, 'Hanya target eskalasi yang dapat reroute.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status sudah final.'], 422);

        $data = $request->validate([
            'reroutedToId' => 'required|integer|different:escalatedToId',
            'commitmentNote' => 'nullable|string|max:500',
        ]);

        $newTarget = User::find($data['reroutedToId']);
        if (!$newTarget) {
            return response()->json(['message' => 'User target reroute tidak ditemukan.'], 422);
        }

        // Apply same cross-direktorat policy yang dipakai store() — requester
        // tetap user asli (bukan yang reroute), supaya tidak bypass policy via reroute.
        $requester = User::find($req->requestedById);
        if ($requester && !$this->orgChain->canEscalateAcrossDirectorate($requester, $newTarget)) {
            return response()->json([
                'message' => 'Tidak diizinkan reroute lintas direktorat untuk requester awal.',
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
                'title' => "[Reroute dari {$user->name}] {$req->title}",
                'description' => $req->description,
                'linkedProgramId' => $req->linkedProgramId,
                'status' => 'REQUESTED',
            ]);

            $this->createNotification($newTarget->id, 'CLEAR_PATH_REQUESTED', $newReq,
                "Eskalasi di-reroute ke Anda: {$newReq->title}");
            $this->createNotification($req->requestedById, 'CLEAR_PATH_REQUESTED', $newReq,
                "Eskalasi Anda di-reroute ke {$newTarget->name}.");
        });

        return response()->json(['data' => $req->fresh()]);
    }

    public function decline(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Hanya target eskalasi yang dapat decline.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status sudah final.'], 422);

        $data = $request->validate(['declinedReason' => 'required|string|min:5|max:1000']);

        $req->update([
            'status' => 'DECLINED',
            'declinedReason' => $data['declinedReason'],
            'resolvedAt' => now(),
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_CLEARED', $req,
            "Eskalasi Anda ditolak oleh {$user->name}: {$data['declinedReason']}");

        return response()->json(['data' => $req->fresh()]);
    }

    public function resolve(Request $request, int $id): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Hanya target eskalasi yang dapat resolve.');
        if (!in_array($req->status, ['COMMITTED', 'IN_PROGRESS'], true)) {
            return response()->json(['message' => 'Resolve hanya untuk request status COMMITTED/IN_PROGRESS.'], 422);
        }

        $data = $request->validate(['resolutionNote' => 'required|string|min:5|max:1000']);

        $req->update([
            'status' => 'CLEARED',
            'resolutionNote' => $data['resolutionNote'],
            'resolvedAt' => now(),
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_CLEARED', $req,
            "Hambatan dibersihkan oleh {$user->name}: {$req->title}");

        return response()->json(['data' => $req->fresh()]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function disposition(Request $request, int $id, string $newStatus, array $extraRules): JsonResponse
    {
        $this->ensureFeatureEnabled($request);
        $user = $request->user();
        $req = EscalationRequest::findOrFail($id);

        if ($req->escalatedToId !== $user->id) abort(403, 'Hanya target eskalasi yang dapat disposition.');
        if ($req->isTerminal()) return response()->json(['message' => 'Status sudah final.'], 422);
        if ($req->status !== 'REQUESTED') {
            return response()->json(['message' => "Status saat ini ({$req->status}) tidak dapat di-{$newStatus}."], 422);
        }

        $data = $request->validate($extraRules);

        $req->update([
            'status' => $newStatus,
            'committedAt' => now(),
            'commitmentDueDate' => $data['commitmentDueDate'] ?? null,
            'commitmentNote' => $data['commitmentNote'] ?? null,
        ]);

        $this->createNotification($req->requestedById, 'CLEAR_PATH_COMMITTED', $req,
            "{$user->name} commit untuk membersihkan: {$req->title}");

        return response()->json(['data' => $req->fresh()]);
    }

    private function assertAccess(User $user, EscalationRequest $req): void
    {
        if ($req->requestedById === $user->id) return;
        if ($req->escalatedToId === $user->id) return;
        if (in_array(strtoupper($user->roleType), ['BOD', 'ADMIN', 'SUPERADMIN'], true)) return;
        abort(403, 'Anda tidak punya akses ke escalation ini.');
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
