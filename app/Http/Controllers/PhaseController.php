<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Phase;
use App\Models\User;
use App\Models\Workstream;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class PhaseController extends Controller
{
    public function storeForWorkstream(Request $request, int $id): JsonResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to create a phase.');
        }
        $this->assertUnitScope($this->ownerUnitForWorkstream($id), $request->user());
        // PENDING-lock (audit 2026-06-17): jangan ubah struktur saat program di-review.
        \App\Services\ProgramService::assertProgramNotUnderApproval(
            Workstream::query()->where('id', $id)->value('programId'),
            $request->user(),
        );

        // Status TIDAK diterima dari klien (2026-06-26): status Phase = turunan
        // dari status task anak (TaskService::recomputeStructureStatus), bukan
        // input manual di Programs. Fase baru selalu mulai 'PLANNING'.
        $data = $request->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string',
            'color' => 'nullable|string|max:20',
            'startWeek' => 'nullable|string|max:10',
            'endWeek' => 'nullable|string|max:10',
            'order' => 'nullable|integer',
        ]);

        $nextOrder = Phase::query()->where('initiativeId', $id)->max('order');
        $phase = Phase::create([
            ...$data,
            'code' => 'PH-' . strtoupper(substr(sha1(uniqid('', true)), 0, 8)),
            'initiativeId' => $id,
            'order' => $data['order'] ?? ((int) $nextOrder + 1),
            'status' => 'PLANNING',
            'healthStatus' => 'YELLOW',
        ]);

        return response()->json(['data' => $phase], 201);
    }

    /**
     * Duplikat satu fase beserta Task-nya di dalam workstream yang sama
     * (copy-from-existing). Reset progres/status — lihat DuplicationService.
     */
    public function duplicate(Request $request, \App\Services\DuplicationService $duplication, int $id): JsonResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to duplicate a phase.');
        }
        $phase = Phase::findOrFail($id);
        $this->assertUnitScope($this->ownerUnitForWorkstream((int) $phase->initiativeId), $request->user());
        \App\Services\ProgramService::assertProgramNotUnderApproval(
            Workstream::query()->where('id', (int) $phase->initiativeId)->value('programId'),
            $request->user(),
        );

        $clone = $duplication->duplicatePhase($request->user(), $phase);

        return response()->json(['data' => $clone], 201);
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to update a phase.');
        }
        $phase = Phase::findOrFail($id);
        $this->assertUnitScope($this->ownerUnitForWorkstream((int) $phase->initiativeId), $request->user());

        // Status di-drop dari validator (2026-06-26) → tak bisa di-set manual;
        // di-derive dari status task anak. Field yang tersisa = struktur/timeline.
        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'description' => 'nullable|string',
            'color' => 'nullable|string|max:20',
            'startWeek' => 'nullable|string|max:10',
            'endWeek' => 'nullable|string|max:10',
            'order' => 'sometimes|integer',
        ]);

        Phase::query()->where('id', $id)->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => Phase::findOrFail($id)]);
        }

        return back()->with('success', 'Phase updated.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to delete a phase.');
        }
        $phase = Phase::findOrFail($id);
        $this->assertUnitScope($this->ownerUnitForWorkstream((int) $phase->initiativeId), $request->user());
        // PENDING-lock (audit 2026-06-17): jangan hapus struktur saat program di-review.
        \App\Services\ProgramService::assertProgramNotUnderApproval(
            Workstream::query()->where('id', (int) $phase->initiativeId)->value('programId'),
            $request->user(),
        );

        Phase::destroy($id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Phase deleted.');
    }

    /**
     * Scope guard (H3): fase mewarisi kepemilikan dari program induknya.
     * Blokir mutasi fase lintas-direktorat — sebelumnya semua role non-BOD
     * bisa edit/hapus/tambah fase di workstream direktorat mana pun.
     */
    private function assertUnitScope(?int $ownerUnitId, User $user): void
    {
        if (!OrgScope::forUser($user)->coversUnit($ownerUnitId)) {
            abort(403, 'You do not have access to a phase that belongs to another unit.');
        }
    }

    private function ownerUnitForWorkstream(int $workstreamId): ?int
    {
        $ownerUnitId = Workstream::query()
            ->with('program:id,ownerUnitId')
            ->find($workstreamId)?->program?->ownerUnitId;
        return $ownerUnitId !== null ? (int) $ownerUnitId : null;
    }
}
