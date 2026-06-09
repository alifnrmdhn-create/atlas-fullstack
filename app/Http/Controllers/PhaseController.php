<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\EntityPic;
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

        $data = $request->validate([
            'name' => 'required|string|max:120',
            'description' => 'nullable|string',
            'status' => 'nullable|string|max:40',
            'color' => 'nullable|string|max:20',
            'startWeek' => 'nullable|string|max:10',
            'endWeek' => 'nullable|string|max:10',
            'picPersonIds' => 'nullable|array',
            'picUnitIds' => 'nullable|array',
            'order' => 'nullable|integer',
        ]);

        $picPersonIds = $data['picPersonIds'] ?? [];
        unset($data['picPersonIds']);

        $nextOrder = Phase::query()->where('initiativeId', $id)->max('order');
        $phase = Phase::create([
            ...$data,
            'code' => 'PH-' . strtoupper(substr(sha1(uniqid('', true)), 0, 8)),
            'initiativeId' => $id,
            'order' => $data['order'] ?? ((int) $nextOrder + 1),
            'status' => $data['status'] ?? 'PLANNING',
            'healthStatus' => 'YELLOW',
        ]);

        if (!empty($picPersonIds)) {
            EntityPic::syncForEntity('Phase', $phase->id, $picPersonIds);
        }

        $phase->load('entityPics');
        return response()->json(['data' => $phase], 201);
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'You do not have permission to update a phase.');
        }
        $phase = Phase::findOrFail($id);
        $this->assertUnitScope($this->ownerUnitForWorkstream((int) $phase->initiativeId), $request->user());

        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'description' => 'nullable|string',
            'status' => 'sometimes|string',
            'color' => 'nullable|string|max:20',
            'startWeek' => 'nullable|string|max:10',
            'endWeek' => 'nullable|string|max:10',
            'picPersonIds' => 'nullable|array',
            'picUnitIds' => 'nullable|array',
            'order' => 'sometimes|integer',
        ]);

        $picPersonIds = array_key_exists('picPersonIds', $data) ? $data['picPersonIds'] : null;
        unset($data['picPersonIds']);

        Phase::query()->where('id', $id)->update($data);

        if ($picPersonIds !== null) {
            EntityPic::syncForEntity('Phase', $id, $picPersonIds ?? []);
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => Phase::with('entityPics')->findOrFail($id)]);
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
