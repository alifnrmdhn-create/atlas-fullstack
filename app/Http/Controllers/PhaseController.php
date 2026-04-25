<?php

namespace App\Http\Controllers;

use App\Models\EntityPic;
use App\Models\Phase;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class PhaseController extends Controller
{
    public function storeForWorkstream(Request $request, int $id): JsonResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'Tidak memiliki izin membuat fase.');
        }

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
            abort(403, 'Tidak memiliki izin mengubah fase.');
        }

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

        return back()->with('success', 'Fase diperbarui.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'Tidak memiliki izin menghapus fase.');
        }

        Phase::destroy($id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Fase dihapus.');
    }
}
