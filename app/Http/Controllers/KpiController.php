<?php

namespace App\Http\Controllers;

use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Models\KpiValueRevision;
use App\Models\Program;
use App\Services\ProgramHealthService;
use App\Support\RolePolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class KpiController extends Controller
{
    public function __construct(private ProgramHealthService $healthService) {}

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
        $kpis = KpiDefinition::query()
            ->with('program:id,code,name')
            ->orderBy('createdAt', 'desc')
            ->get();

        return response()->json(['data' => $kpis, 'total' => $kpis->count()]);
    }

    public function show(int $id)
    {
        $kpi = KpiDefinition::with(['values' => fn ($q) => $q->orderBy('measurementDate', 'desc')])->findOrFail($id);
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

        // Update KPI actualValue + trigger health
        $kpi->update(['actualValue' => $data['actualValue'], 'lastMeasuredDate' => $data['measurementDate']]);
        if ($kpi->programId) {
            rescue(fn () => $this->healthService->recompute($kpi->programId));
        }

        if ($request->expectsJson()) {
            return response()->json(['data' => $value], 201);
        }

        return back()->with('success', 'KPI value saved.');
    }
}
