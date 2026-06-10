<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\Directorate;
use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Services\OrgSummaryService;
use App\Services\ProgramSnapshotService;
use App\Models\OrganizationalUnit;
use App\Models\Position;
use App\Models\PositionHistory;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

class OrganizationController extends Controller
{
    public function __construct(private readonly OrgSummaryService $orgSummary)
    {
    }

    // ── Pages ─────────────────────────────────────────────────────────────────

    public function hierarchy(): Response
    {
        $directorates = Directorate::where('isActive', true)->orderBy('code')->get();
        $units = OrganizationalUnit::with('directorate:id,code,name')
            ->orderBy('code')->get();
        $positions = Position::with(['directorate:id,code', 'division:id,code'])
            ->orderBy('seatOrder')->get();
        $users = User::where('isActive', true)
            ->select('id','name','roleType','unitId','directorateId','positionId','positionTitle','managerUserId')
            ->get();

        $usersByUnit = $users->groupBy('unitId');
        $positionsByUnit = $positions->groupBy('divisionId');

        $tree = $directorates->map(fn ($dir) => [
            ...$dir->toArray(),
            'divisionCount' => $units->where('directorateId', $dir->id)->count(),
            'userCount' => $users->where('directorateId', $dir->id)->count(),
            'divisions' => $units->where('directorateId', $dir->id)->map(fn ($unit) => [
                ...$unit->toArray(),
                'positionCount' => $positionsByUnit->get($unit->id, collect())->count(),
                'occupiedPositionCount' => $positionsByUnit->get($unit->id, collect())->filter(fn ($p) => $users->contains('positionId', $p->id))->count(),
                'positions' => $positionsByUnit->get($unit->id, collect())->sortBy('seatOrder')->map(fn ($p) => [
                    ...$p->toArray(),
                    'occupant' => $users->firstWhere('positionId', $p->id),
                ])->values()->all(),
            ])->values()->all(),
        ])->values()->all();

        return Inertia::render('OrganizationView', [
            'summary' => [
                'directorateCount' => $directorates->count(),
                'divisionCount' => $units->count(),
                'positionCount' => $positions->count(),
                'userCount' => $users->count(),
            ],
            'directorates' => $tree,
        ]);
    }

    // ── Program Summary (Executive Dashboard) ─────────────────────────────────

    public function programSummary(Request $request): JsonResponse
    {
        $user = $request->user();

        // Endpoint terberat di workspace bootstrap (agregasi 97 program + ratusan
        // task/blocker/KPI, dihitung fresh tiap request). Cache per-user TTL 3 menit
        // memangkas waktu absolut tanpa bikin angka basi terlalu lama. Key per-user
        // karena scope/visibility diturunkan dari user. `bust=1` untuk skip cache.
        $cacheKey = "program_summary:user:{$user->id}";
        if ($request->boolean('bust')) {
            Cache::forget($cacheKey);
        }

        $payload = Cache::remember($cacheKey, now()->addMinutes(3), function () use ($user) {
            // Normalisasi ke array murni sebelum di-cache. buildProgramSummary()
            // mengembalikan objek Collection (byDivisi/programsForChart/controls/…);
            // kalau itu yang disimpan, cache `file` men-`serialize()`-nya lalu
            // membaca balik sebagai __PHP_Incomplete_Class → command center KOSONG
            // pada tiap cache-hit (load pertama miss masih benar). json round-trip
            // bikin struktur serialize-safe. (fix Jun 2026)
            return json_decode(json_encode($this->orgSummary->build($user)), true);
        });

        return response()->json($payload);
    }


    // ── Directorates ──────────────────────────────────────────────────────────

    public function directorates()
    {
        $dirs = Directorate::orderBy('code')->get()
            ->map(fn ($d) => [
                ...$d->toArray(),
                'unitCount' => OrganizationalUnit::where('directorateId', $d->id)->count(),
            ])->values();

        return response()->json(['data' => $dirs]);
    }

    public function storeDirectorate(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:Directorate,code',
            'name' => 'required|string|min:2|max:120',
            'shortName' => 'nullable|string|max:40',
            'domain' => 'nullable|string|max:120',
            'isActive' => 'boolean',
        ]);
        $dir = Directorate::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $dir], 201);
        }

        return back()->with('success', 'Direktorat dibuat.');
    }

    public function updateDirectorate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => "sometimes|string|min:2|max:40|unique:Directorate,code,{$id}",
            'name' => 'sometimes|string|min:2|max:120',
            'shortName' => 'nullable|string|max:40',
            'domain' => 'nullable|string|max:120',
            'isActive' => 'sometimes|boolean',
        ]);
        $dir = Directorate::findOrFail($id);
        $dir->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $dir->fresh()]);
        }

        return back()->with('success', 'Directorate updated.');
    }

    public function destroyDirectorate(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        Directorate::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Directorate deleted.');
    }

    // ── Units ─────────────────────────────────────────────────────────────────

    public function units()
    {
        $units = OrganizationalUnit::with('directorate:id,code,name')->orderBy('code')->get();
        return response()->json(['data' => $units, 'total' => $units->count()]);
    }

    public function storeUnit(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:OrganizationalUnit,code',
            'name' => 'required|string|min:2|max:120',
            'description' => 'nullable|string|max:400',
            'unitType' => 'required|string|max:40',
            'directorateId' => 'nullable|integer',
            'parentId' => 'nullable|integer',
            'isActive' => 'boolean',
        ]);
        $unit = OrganizationalUnit::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $unit], 201);
        }

        return back()->with('success', 'Unit dibuat.');
    }

    public function updateUnit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => "sometimes|string|min:2|max:40|unique:OrganizationalUnit,code,{$id}",
            'name' => 'sometimes|string|min:2|max:120',
            'description' => 'nullable|string|max:400',
            'unitType' => 'sometimes|string|max:40',
            'directorateId' => 'nullable|integer',
            'parentId' => 'nullable|integer',
            'isActive' => 'sometimes|boolean',
        ]);
        $unit = OrganizationalUnit::findOrFail($id);
        $unit->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $unit->fresh()]);
        }

        return back()->with('success', 'Unit updated.');
    }

    public function destroyUnit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        OrganizationalUnit::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Unit deleted.');
    }

    // ── Positions ─────────────────────────────────────────────────────────────

    public function positions()
    {
        $positions = Position::with([
            'directorate:id,code,name',
            'division:id,code,name',
            'users' => fn ($q) => $q->whereRaw('"isActive" IS TRUE')->select('id','name','roleType','positionId'),
        ])->orderBy('seatOrder')->get()
            ->map(fn ($p) => [
                ...$p->toArray(),
                'title'         => $p->name,
                'unit'          => $p->division,
                'level'         => $p->levelCode ? (int) filter_var($p->levelCode, FILTER_SANITIZE_NUMBER_INT) : null,
                'currentHolder' => $p->users->first(),
            ])->values();

        return response()->json(['data' => $positions, 'total' => $positions->count()]);
    }

    public function storePosition(Request $request): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:Position,code',
            'name' => 'required|string|min:2|max:120',
            'levelCode' => 'required|string|max:20',
            'roleType' => 'required|string',
            'directorateId' => 'nullable|integer',
            'divisionId' => 'nullable|integer',
            'reportsToPositionId' => 'nullable|integer',
            'seatOrder' => 'nullable|integer',
            'isActive' => 'boolean',
        ]);
        $position = Position::create($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $position], 201);
        }

        return back()->with('success', 'Jabatan dibuat.');
    }

    public function updatePosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'name' => 'sometimes|string|min:2|max:120',
            'levelCode' => 'sometimes|string|max:20',
            'roleType' => 'sometimes|string',
            'directorateId' => 'nullable|integer',
            'divisionId' => 'nullable|integer',
            'reportsToPositionId' => 'nullable|integer',
            'seatOrder' => 'nullable|integer',
            'isActive' => 'sometimes|boolean',
        ]);
        $position = Position::findOrFail($id);
        $position->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $position->fresh()]);
        }

        return back()->with('success', 'Position updated.');
    }

    public function destroyPosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        // Unassign users from this position first
        User::where('positionId', $id)->update(['positionId' => null]);
        Position::findOrFail($id)->delete();

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'Position deleted.');
    }

    public function assignPosition(Request $request, int $id): JsonResponse|RedirectResponse
    {
        RolePolicy::canManageUsers($request->user()->roleType) || abort(403);
        $data = $request->validate([
            'userId' => 'nullable|integer',
            'mutationType' => 'nullable|string',
            'mutationReason' => 'nullable|string',
            'skNumber' => 'nullable|string',
        ]);

        $position = Position::findOrFail($id);

        // Unassign previous holder
        User::where('positionId', $id)->update(['positionId' => null]);

        if ($data['userId']) {
            $user = User::findOrFail($data['userId']);
            $user->update(['positionId' => $id]);

            // Record history
            PositionHistory::create([
                'userId' => $user->id,
                'positionId' => $id,
                'startDate' => now(),
                'mutationType' => $data['mutationType'] ?? 'reassignment',
                'mutationReason' => $data['mutationReason'] ?? null,
                'skNumber' => $data['skNumber'] ?? null,
                'createdBy' => $request->user()->id,
            ]);
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $position->fresh(['users' => fn ($q) => $q->whereRaw('"isActive" IS TRUE')])]);
        }

        return back()->with('success', 'Penugasan jabatan disimpan.');
    }
}
