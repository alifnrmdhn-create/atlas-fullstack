<?php

namespace App\Http\Controllers;

use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Models\Program;
use App\Services\ProgramHealthService;
use App\Support\RolePolicy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

    public function store(Request $request): RedirectResponse
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
            if ($prog !== $request->user()->id) abort(403, 'Hanya owner program yang dapat menambah KPI internal.');
        }

        $kpi = KpiDefinition::create([
            ...$data,
            'dataType' => self::inferDataType($data['unitOfMeasure'] ?? null, $data['metricType']),
        ]);

        return back()->with('success', 'KPI dibuat.');
    }

    public function update(Request $request, int $id): RedirectResponse
    {
        $kpi = KpiDefinition::findOrFail($id);
        $user = $request->user();

        if (!RolePolicy::canManageUsers($user->roleType)) {
            if ($kpi->programId) {
                $ownerId = Program::query()->where('id', $kpi->programId)->value('ownerId');
                if ($ownerId !== $user->id) abort(403, 'Hanya owner program atau admin yang dapat mengubah KPI ini.');
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
        return back()->with('success', 'KPI diperbarui.');
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        if (!RolePolicy::canManageUsers($request->user()->roleType)) abort(403, 'Forbidden');
        KpiDefinition::destroy($id);
        return back()->with('success', 'KPI dihapus.');
    }

    public function storeValue(Request $request, int $id): RedirectResponse
    {
        $kpi = KpiDefinition::findOrFail($id);

        // Cek program masih dalam eksekusi
        if ($kpi->programId) {
            $approvalStatus = Program::query()->where('id', $kpi->programId)->value('approvalStatus');
            if (!in_array($approvalStatus, ['ACTIVE'], true)) {
                return back()->withErrors(['Program belum aktif — KPI belum bisa diukur.']);
            }
        }

        $data = $request->validate([
            'measurementDate' => 'required|date',
            'actualValue' => 'required|numeric',
            'targetValue' => 'nullable|numeric',
            'statusNotes' => 'nullable|string|max:500',
        ]);

        $value = KpiValue::create([
            ...$data,
            'kpiDefinitionId' => $id,
            'measuredBy' => $request->user()->id,
        ]);

        // Update KPI actualValue + trigger health
        $kpi->update(['actualValue' => $data['actualValue'], 'lastMeasuredDate' => $data['measurementDate']]);
        if ($kpi->programId) {
            rescue(fn () => $this->healthService->recompute($kpi->programId));
        }

        return back()->with('success', 'Nilai KPI disimpan.');
    }
}
