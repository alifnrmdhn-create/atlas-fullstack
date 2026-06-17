<?php

namespace App\Http\Controllers;

use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Models\KpiValueRevision;
use App\Models\Program;
use App\Services\BroadcastService;
use App\Services\ProgramHealthService;
use App\Services\ProgramService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class KpiController extends Controller
{
    public function __construct(
        private ProgramHealthService $healthService,
        private ProgramService $programService,
    ) {}

    private static function inferDataType(?string $unit, ?string $metricType): string
    {
        $u = strtolower(trim($unit ?? ''));
        $m = strtoupper(trim($metricType ?? ''));
        if (str_starts_with($u, 'rp') || $m === 'CURRENCY') return 'CURRENCY';
        if ($u === '%' || str_contains($u, 'persen') || $m === 'PERCENTAGE') return 'PERCENTAGE';
        return 'NUMERIC';
    }

    public function index(Request $request)
    {
        // Scope read-path: non-eksekutif hanya melihat KPI program dalam aksesnya
        // + KPI global (tanpa programId). Sebelumnya semua KPI lintas-direktorat
        // terkirim ke semua user. Eksekutif (null) tetap melihat semua.
        $programIds = $this->programService->accessibleProgramIds($request->user());

        $kpis = KpiDefinition::query()
            ->with('program:id,code,name')
            ->when($programIds !== null, fn ($q) => $q->where(
                fn ($w) => $w->whereNull('programId')->orWhereIn('programId', $programIds)
            ))
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json(['data' => $kpis, 'total' => $kpis->count()]);
    }

    public function show(Request $request, int $id)
    {
        $kpi = KpiDefinition::with(['values' => fn ($q) => $q->orderBy('measurementDate', 'desc')])->findOrFail($id);

        // KPI terikat program → user harus punya akses ke program tsb.
        if ($kpi->programId) {
            $this->programService->assertAccess($request->user(), (int) $kpi->programId);
        }

        return response()->json(['data' => $kpi]);
    }

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $data = $request->validate([
            'code' => 'required|string|min:2|max:40|unique:KpiDefinition,code',
            'name' => 'required|string|min:2|max:120',
            'description' => 'nullable|string|max:400',
            'metricType' => 'required|string|max:40',
            'dataType' => 'sometimes|string|max:20',
            'targetValue' => 'required|numeric',
            'warningThreshold' => 'nullable|numeric',
            'criticalThreshold' => 'nullable|numeric',
            'unitOfMeasure' => 'nullable|string|max:30',
            'reviewFrequency' => 'in:WEEKLY,MONTHLY,QUARTERLY,ANNUALLY',
            'isLeadingIndicator' => 'boolean',
            'isActive' => 'boolean',
            'programId' => 'nullable|integer',
        ]);

        // Non-admin hanya boleh buat KPI internal milik program sendiri
        if (!RolePolicy::canManageUsers($request->user()->roleType)) {
            if (empty($data['programId'])) abort(403, 'Forbidden');
            $prog = Program::query()->where('id', $data['programId'])->value('ownerId');
            if ($prog !== $request->user()->id) abort(403, 'Only the program owner can add an internal KPI.');
        }

        $kpi = KpiDefinition::create([
            ...$data,
            'dataType' => self::inferDataType($data['unitOfMeasure'] ?? null, $data['metricType']),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $kpi], 201);
        }

        return back()->with('success', 'KPI created.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $kpi = KpiDefinition::findOrFail($id);
        $user = $request->user();

        if (!RolePolicy::canManageUsers($user->roleType)) {
            if ($kpi->programId) {
                $ownerId = Program::query()->where('id', $kpi->programId)->value('ownerId');
                if ($ownerId !== $user->id) abort(403, 'Only the program owner or an admin can edit this KPI.');
            } else {
                abort(403, 'Forbidden');
            }
        }

        $data = $request->validate([
            'name' => 'sometimes|string|max:120',
            'targetValue' => 'sometimes|numeric',
            'warningThreshold' => 'nullable|numeric',
            'criticalThreshold' => 'nullable|numeric',
            'unitOfMeasure' => 'nullable|string|max:30',
            'metricType' => 'sometimes|string|max:40',
            'reviewFrequency' => 'sometimes|in:WEEKLY,MONTHLY,QUARTERLY,ANNUALLY',
            'isActive' => 'sometimes|boolean',
        ]);

        $kpi->update($data);

        if ($request->expectsJson()) {
            return response()->json(['data' => $kpi->fresh()]);
        }

        return back()->with('success', 'KPI updated.');
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        if (!RolePolicy::canManageUsers($request->user()->roleType)) abort(403, 'Forbidden');
        KpiDefinition::destroy($id);

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back()->with('success', 'KPI deleted.');
    }

    public function storeValue(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $kpi = KpiDefinition::findOrFail($id);
        $user = $request->user();

        // Authorization: nilai realisasi KPI = data "realitas" program. Hanya
        // user yang punya akses program (owner/PIC/scope) yang boleh menulis.
        // Sebelumnya tanpa cek apa pun — siapa pun bisa isi KPI program manapun.
        if (RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'Your role is not allowed to perform this action.');
        }
        if ($kpi->programId) {
            $this->programService->assertAccess($user, (int) $kpi->programId);
        } elseif (!RolePolicy::canManageUsers($user->roleType)) {
            // KPI global/divisi (tanpa program induk) hanya boleh diisi admin.
            abort(403, 'Only an admin can record values for a global KPI.');
        }

        // Cek program masih dalam eksekusi
        if ($kpi->programId) {
            $approvalStatus = Program::query()->where('id', $kpi->programId)->value('approvalStatus');
            if (!in_array($approvalStatus, ['ACTIVE'], true)) {
                if ($request->expectsJson()) {
                    return response()->json(['message' => 'The program is not active yet — KPIs cannot be measured.'], 422);
                }
                return back()->withErrors(['The program is not active yet — KPIs cannot be measured.']);
            }
        }

        $data = $request->validate([
            'measurementDate' => 'required|date',
            'actualValue' => 'required|numeric',
            'targetValue' => 'nullable|numeric',
            'statusNotes' => 'nullable|string|max:500',
        ]);

        // Read-existing + insert-revision + updateOrCreate dibungkus DB::transaction
        // supaya atomic. Tanpa wrapper, race condition: dua user submit nilai
        // KPI berbeda untuk (kpi, date) yang sama bersamaan → revision snapshot
        // bisa save value yang sudah out-of-date, atau worse: revision tertulis
        // tapi updateOrCreate fail → data inconsistent.
        // lockForUpdate pada SELECT existing supaya transaksi lain wait sampai
        // commit/rollback selesai. Lock release otomatis saat closure return.
        $value = DB::transaction(function () use ($id, $data, $request) {
            $existing = KpiValue::query()
                ->where('kpiDefinitionId', $id)
                ->where('measurementDate', $data['measurementDate'])
                ->lockForUpdate()
                ->first();

            if ($existing && (float) $existing->actualValue !== (float) $data['actualValue']) {
                // Value berubah → snapshot lama ke history.
                // Skip no-op updates yang cuma touch statusNotes/targetValue.
                KpiValueRevision::create([
                    'kpiValueId'          => $existing->id,
                    'kpiDefinitionId'     => $id,
                    'measurementDate'     => $existing->measurementDate,
                    'previousActualValue' => $existing->actualValue,
                    'previousTargetValue' => $existing->targetValue,
                    'previousStatusNotes' => $existing->statusNotes,
                    'previousMeasuredBy'  => $existing->measuredBy,
                    'revisedBy'           => $request->user()->id,
                ]);
            }

            // updateOrCreate (bukan create) supaya re-submit untuk minggu yang sama
            // mengganti nilai, bukan crash dengan unique violation.
            return KpiValue::updateOrCreate(
                [
                    'kpiDefinitionId' => $id,
                    'measurementDate' => $data['measurementDate'],
                ],
                [
                    'actualValue' => $data['actualValue'],
                    'targetValue' => $data['targetValue'] ?? null,
                    'statusNotes' => $data['statusNotes'] ?? null,
                    'measuredBy'  => $request->user()->id,
                ]
            );
        });

        // FIX (audit 2026-06-17): rollup actualValue/lastMeasuredDate dari pengukuran
        // dengan measurementDate TERBARU, bukan dari payload mentah. Tanpa ini,
        // back-fill nilai bertanggal lama menimpa actualValue terkini → health
        // dihitung atas realisasi usang (actualValue satu-satunya field yang dibaca
        // ProgramHealthService::kpiStatus).
        $latest = KpiValue::query()
            ->where('kpiDefinitionId', $id)
            ->orderByDesc('measurementDate')
            ->first(['actualValue', 'measurementDate']);
        if ($latest) {
            $kpi->update([
                'actualValue'      => $latest->actualValue,
                'lastMeasuredDate' => $latest->measurementDate,
            ]);
        }
        if ($kpi->programId) {
            rescue(fn () => $this->healthService->recompute($kpi->programId));
        }

        // FIX (audit 2026-06-17): pancarkan broadcast supaya layar lain (dashboard,
        // badge health program) refresh via polling 2s. Sebelumnya nilai KPI berubah
        // & health re-compute tapi tak ada BroadcastEvent → hanya terlihat saat
        // reload manual (FE sudah punya handler 'kpi:changed' & 'program:changed').
        BroadcastService::kpi($id, 'value-recorded', $kpi->programId ? ['programId' => (int) $kpi->programId] : []);
        if ($kpi->programId) {
            BroadcastService::program((int) $kpi->programId, 'health-recomputed');
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $value], 201);
        }

        return back()->with('success', 'KPI value saved.');
    }
}
