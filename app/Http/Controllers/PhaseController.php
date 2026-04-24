<?php

namespace App\Http\Controllers;

use App\Models\Phase;
use App\Support\RolePolicy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class PhaseController extends Controller
{
    public function update(Request $request, int $id): RedirectResponse
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

        Phase::query()->where('id', $id)->update($data);
        return back()->with('success', 'Fase diperbarui.');
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        if (!RolePolicy::canCreateProgram($request->user()->roleType)) {
            abort(403, 'Tidak memiliki izin menghapus fase.');
        }

        Phase::destroy($id);
        return back()->with('success', 'Fase dihapus.');
    }
}
