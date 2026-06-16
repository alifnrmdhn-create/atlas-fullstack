<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\Blocker;
use App\Models\KpiDefinition;
use App\Models\MonthlyReport;
use App\Models\MonthlyReportApproval;
use App\Models\MonthlyReportFile;
use App\Models\MonthlyReportMetric;
use App\Models\Program;
use App\Models\ProgramProgressLog;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use App\Support\RolePolicy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use PhpOffice\PhpSpreadsheet\IOFactory;

class MonthlyReportController extends Controller
{
    private const NEXT_APPROVER = [
        'ASISTEN'  => 'KASUBDIV',
        'KASUBDIV' => 'KADIV',
    ];

    private const STATUS_AFTER = [
        'APPROVED'            => ['KASUBDIV' => 'REVIEWED', 'KADIV' => 'APPROVED'],
        'REJECTED'            => ['KASUBDIV' => 'REJECTED', 'KADIV' => 'REJECTED'],
        'REVISION_REQUESTED'  => ['KASUBDIV' => 'DRAFT',    'KADIV' => 'DRAFT'],
    ];

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request)
    {
        $query = MonthlyReport::query()
            ->select('MonthlyReport.*')
            ->leftJoin('OrganizationalUnit as unit', 'MonthlyReport.unitId', '=', 'unit.id')
            ->with([
                'unit:id,code,name',
                'submittedBy:id,name',
                'approvals.approver:id,name,roleType',
            ])
            ->withCount(['metrics', 'files'])
            ->orderByDesc('year')->orderByDesc('month')->orderBy('unit.name');

        if ($request->year)   $query->where('year', $request->year);
        if ($request->month)  $query->where('month', $request->month);
        if ($request->unitId) $query->where('unitId', $request->unitId);
        if ($request->status) $query->where('status', $request->status);

        $reports = $query->get();
        if ($request->expectsJson()) {
            return response()->json(['data' => $reports, 'total' => $reports->count()]);
        }

        return Inertia::render('MonthlyReportView', [
            'reports' => $reports,
            'filters' => $request->only(['year', 'month', 'unitId', 'status']),
        ]);
    }

    /** Pastikan user boleh mengakses report: unit sama, atau KADIV/Admin ke atas. */
    private function assertReportAccess(\App\Models\User $user, MonthlyReport $report): void
    {
        $role = strtoupper($user->roleType ?? '');
        if (RolePolicy::isAdminOrAbove($role) || $role === 'KADIV') return;
        if ($user->unitId && $user->unitId === $report->unitId) return;
        abort(403, 'You do not have access to this report.');
    }

    /**
     * Gate TULIS: unit report wajib dalam OrgScope user (mirror
     * RiskReportController::assertCanWriteUnit). Audit 2026-06-10:
     * update/upload/submit dulu hanya cek status DRAFT — user terotentikasi
     * mana pun bisa mengedit/menimpa metrics/men-submit laporan unit lain.
     */
    private function assertReportWriteAccess(\App\Models\User $user, MonthlyReport $report): void
    {
        $scope = OrgScope::forUser($user);
        $inScope = $scope->isExecutive || in_array((int) $report->unitId, $scope->unitIds, true);
        if (!$inScope || RolePolicy::isReadOnly($user->roleType)) {
            abort(403, 'You are not allowed to modify this report.');
        }
    }

    public function show(Request $request, int $id)
    {
        $report = MonthlyReport::with([
            'unit:id,code,name',
            'submittedBy:id,name',
            'metrics',
            'files.uploadedBy:id,name',
            'approvals.approver:id,name,roleType',
        ])->findOrFail($id);

        $this->assertReportAccess($request->user(), $report);

        $linkedPrograms = !empty($report->linkedProgramIds)
            ? Program::whereIn('id', $report->linkedProgramIds)->get(['id','code','name'])->all()
            : [];

        if ($request->expectsJson()) {
            return response()->json([
                'data' => $report,
                'linkedPrograms' => $linkedPrograms,
            ]);
        }

        return Inertia::render('MonthlyReportDetailView', [
            'report' => $report,
            'linkedPrograms' => $linkedPrograms,
        ]);
    }

    public function autoDraft(Request $request, int $id): JsonResponse
    {
        $report = MonthlyReport::findOrFail($id);
        $this->assertReportAccess($request->user(), $report);

        if (empty($report->linkedProgramIds)) {
            return response()->json(['data' => [], 'note' => 'No programs are linked to this report.']);
        }

        $linkedIds = is_array($report->linkedProgramIds) ? $report->linkedProgramIds : [];
        if (empty($linkedIds)) {
            return response()->json(['data' => [], 'note' => 'No programs are linked to this report.']);
        }

        $programs = Program::whereIn('id', $linkedIds)
            ->get(['id', 'code', 'name', 'healthStatus', 'progressPercent']);

        $year       = $report->year;
        $month      = $report->month;
        $monthStart = Carbon::createFromDate($year, $month, 1)->startOfMonth();
        $monthEnd   = $monthStart->copy()->endOfMonth();
        $monthPrefix = $year . '-' . str_pad((string) $month, 2, '0', STR_PAD_LEFT);

        // ── Batch semua data sekaligus — hindari N+1 ─────────────────────────

        // 1. Progress logs bulan ini per program (ambil latest per programId)
        $progressLogs = ProgramProgressLog::query()
            ->whereIn('programId', $linkedIds)
            ->where(function ($q) use ($monthPrefix, $monthStart, $monthEnd) {
                $q->where('period', $monthPrefix)
                  ->orWhereBetween('createdAt', [$monthStart, $monthEnd]);
            })
            ->orderBy('createdAt', 'desc')
            ->get()
            ->unique('programId')   // ambil satu (terbaru) per program
            ->keyBy('programId');

        // 2. Task stats per program dalam satu query
        $taskStats = Task::query()
            ->join('Initiative', 'WorkItem.initiativeId', '=', 'Initiative.id')
            ->whereIn('Initiative.programId', $linkedIds)
            ->selectRaw('"Initiative"."programId", COUNT(*) as total, SUM(CASE WHEN "WorkItem"."status" = \'COMPLETED\' THEN 1 ELSE 0 END) as completed')
            ->groupBy('Initiative.programId')
            ->get()
            ->keyBy('programId');

        // 3. Task IDs per program untuk blocker lookup
        $tasksByProgram = Task::query()
            ->join('Initiative', 'WorkItem.initiativeId', '=', 'Initiative.id')
            ->whereIn('Initiative.programId', $linkedIds)
            ->select('WorkItem.id', 'Initiative.programId')
            ->get()
            ->groupBy('programId');

        // Build reverse map taskId → programId sekali, O(1) lookup per blocker
        $taskProgramMap = $tasksByProgram
            ->flatMap(fn ($tasks, $pid) => $tasks->mapWithKeys(fn ($t) => [$t->id => $pid]))
            ->all();

        $allTaskIds = array_keys($taskProgramMap);

        // 4. Blocker count per program — open blockers yang exist pada bulan ini
        $blockerCounts = Blocker::query()
            ->whereIn('workItemId', $allTaskIds)
            ->where('status', 'OPEN')
            ->where('createdAt', '<=', $monthEnd)
            ->pluck('workItemId')
            ->groupBy(fn ($taskId) => $taskProgramMap[$taskId] ?? null)
            ->filter(fn ($group, $key) => $key !== null)
            ->map->count();

        // 5. KPI per program
        $kpisByProgram = KpiDefinition::query()
            ->whereIn('programId', $linkedIds)
            ->whereNotNull('actualValue')
            ->whereNotNull('targetValue')
            ->get(['programId', 'name', 'actualValue', 'targetValue', 'unitOfMeasure'])
            ->groupBy('programId');

        // ── Assemble hasil ───────────────────────────────────────────────────
        $drafts = [];
        foreach ($programs as $program) {
            $pid   = $program->id;
            $stats = $taskStats->get($pid);
            $log   = $progressLogs->get($pid);
            $kpis  = $kpisByProgram->get($pid, collect());

            $kpiSummary = $kpis->map(function ($k) {
                $target = (float) $k->targetValue;
                return [
                    'name'   => $k->name,
                    'actual' => (float) $k->actualValue,
                    'target' => $target,
                    'unit'   => $k->unitOfMeasure,
                    'pct'    => $target !== 0.0 ? round((float) $k->actualValue / $target * 100, 1) : null,
                ];
            })->values()->all();

            $healthLabel = match($program->healthStatus) {
                'GREEN'  => 'On Track',
                'YELLOW' => 'At Risk',
                'RED'    => 'Delayed',
                default  => $program->healthStatus ?? 'Unknown',
            };

            $drafts[] = [
                'programId'       => $pid,
                'code'            => $program->code,
                'name'            => $program->name,
                'healthStatus'    => $program->healthStatus,
                'healthLabel'     => $healthLabel,
                'progressPercent' => $program->progressPercent ?? 0,
                'totalTasks'      => (int) ($stats->total ?? 0),
                'completedTasks'  => (int) ($stats->completed ?? 0),
                'activeBlockers'  => (int) ($blockerCounts->get($pid, 0)),
                'latestLog'       => $log ? [
                    'period'             => $log->period,
                    'healthAtTime'       => $log->healthAtTime,
                    'narrative'          => $log->narrative,
                    'kendala'            => $log->kendala,
                    'dukunganDibutuhkan' => $log->dukunganDibutuhkan,
                ] : null,
                'kpis' => $kpiSummary,
            ];
        }

        return response()->json(['data' => $drafts]);
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $user = $request->user();
        if (!$user->unitId) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'You are not registered to any unit.'], 422);
            }
            return back()->withErrors(['You are not registered to any unit.']);
        }

        $data = $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2020|max:2100',
            'narrativeSummary' => 'nullable|string|max:10000',
            'highlights' => 'nullable|string|max:5000',
            'linkedProgramIds' => 'nullable|array',
            'linkedProgramIds.*' => 'integer',
        ]);

        // Duplicate check
        $existing = MonthlyReport::where('unitId', $user->unitId)
            ->where('month', $data['month'])
            ->where('year', $data['year'])
            ->first();
        if ($existing) {
            if ($request->expectsJson()) {
                return response()->json(['message' => "A report for {$data['month']}/{$data['year']} already exists for this division (status: {$existing->status})."], 422);
            }
            return back()->withErrors(["A report for {$data['month']}/{$data['year']} already exists for this division (status: {$existing->status})."]);
        }

        $linkedIds = $data['linkedProgramIds'] ?? [];
        if (!empty($linkedIds)) {
            $planning = Program::whereIn('id', $linkedIds)
                ->whereIn('approvalStatus', ['DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'])
                ->get(['code']);
            if ($planning->isNotEmpty()) {
                $codes = $planning->pluck('code')->join(', ');
                if ($request->expectsJson()) {
                    return response()->json(['message' => "The following programs are still in the Planning phase: {$codes}"], 422);
                }
                return back()->withErrors(["The following programs are still in the Planning phase: {$codes}"]);
            }
        }

        $report = MonthlyReport::create([
            'unitId' => $user->unitId,
            'month' => $data['month'],
            'year' => $data['year'],
            'narrativeSummary' => $data['narrativeSummary'] ?? null,
            'highlights' => $data['highlights'] ?? null,
            'status' => 'DRAFT',
            'linkedProgramIds' => $linkedIds,
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $report], 201);
        }

        return redirect()->route('monthly-reports.show', $report->id)->with('success', 'Report created.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        $this->assertReportWriteAccess($request->user(), $report);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Only DRAFT reports can be edited.'], 422);
            }
            return back()->withErrors(['Only DRAFT reports can be edited.']);
        }

        $data = $request->validate([
            'narrativeSummary' => 'nullable|string|max:10000',
            'highlights' => 'nullable|string|max:5000',
            'linkedProgramIds' => 'nullable|array',
        ]);

        $report->update($data);
        if ($request->expectsJson()) {
            return response()->json(['data' => $report->fresh()]);
        }

        return back()->with('success', 'Report updated.');
    }

    /**
     * Upload Excel → parse → replace semua metrics.
     * Format sheet: A=Section B=Kategori C=Label D=Satuan E=RKAP F=Realisasi G=TahunLalu
     */
    public function upload(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        $this->assertReportWriteAccess($request->user(), $report);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Only DRAFT reports can be updated.'], 422);
            }
            return back()->withErrors(['Only DRAFT reports can be updated.']);
        }

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ]);

        $file = $request->file('file');
        $storedName = 'report-' . time() . '-' . bin2hex(random_bytes(8)) . '.' . $file->getClientOriginalExtension();
        $storedPath = "reports/{$storedName}";
        $disk = config('uploads.private_disk');

        // Parse DULU dari file temp upload (getRealPath = selalu lokal, valid utk
        // PhpSpreadsheet apa pun disk tujuannya) — JANGAN ->path() disk tujuan,
        // yang tak ada di S3 (scale-readiness S1.4). Hanya simpan bila parse sukses,
        // jadi tak perlu hapus-saat-gagal.
        try {
            $metrics = $this->parseExcel($file->getRealPath());
        } catch (\Exception $e) {
            if ($request->expectsJson()) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            return back()->withErrors([$e->getMessage()]);
        }

        Storage::disk($disk)->putFileAs('reports', $file, $storedName);

        DB::transaction(function () use ($report, $metrics, $storedName, $storedPath, $file, $request) {
            MonthlyReportMetric::where('reportId', $report->id)->delete();
            MonthlyReportMetric::insert(
                array_map(fn ($m) => [...$m, 'reportId' => $report->id], $metrics)
            );
            MonthlyReportFile::create([
                'reportId' => $report->id,
                'filename' => $storedName,
                'originalName' => $file->getClientOriginalName(),
                'filepath' => $storedPath,
                'filesize' => $file->getSize(),
                'uploadedById' => $request->user()->id,
            ]);
        });

        $report->refresh()->load(['unit:id,code,name', 'submittedBy:id,name', 'metrics', 'files']);
        if ($request->expectsJson()) {
            return response()->json(['data' => $report]);
        }

        return back()->with('success', 'Excel data imported successfully (' . count($metrics) . ' rows).');
    }

    public function submit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::withCount('metrics')->findOrFail($id);
        $this->assertReportWriteAccess($request->user(), $report);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Only DRAFT reports can be submitted.'], 422);
            }
            return back()->withErrors(['Only DRAFT reports can be submitted.']);
        }
        if ($report->metrics_count === 0) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Upload the Excel data before submitting.'], 422);
            }
            return back()->withErrors(['Upload the Excel data before submitting.']);
        }

        $report->update([
            'status' => 'SUBMITTED',
            'submittedById' => $request->user()->id,
            'submittedAt' => now(),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $report->fresh()]);
        }

        return back()->with('success', 'Report submitted.');
    }

    public function approve(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $user = $request->user();
        $roleType = strtoupper($user->roleType);

        $data = $request->validate([
            'action' => 'required|in:APPROVED,REJECTED,REVISION_REQUESTED',
            'note' => 'nullable|string|max:500',
        ]);

        $report = MonthlyReport::findOrFail($id);

        // Scope unit WAJIB (mirror RiskReportController::approve) — audit
        // 2026-06-10: tanpa ini KASUBDIV/KADIV mana pun bisa approve/reject
        // laporan unit & direktorat lain.
        $scope = OrgScope::forUser($user);
        $inScope = $scope->isExecutive || in_array((int) $report->unitId, $scope->unitIds, true);

        $canApprove = $inScope && (
            ($roleType === 'KASUBDIV' && $report->status === 'SUBMITTED')
            || ($roleType === 'KADIV' && $report->status === 'REVIEWED')
        );

        if (!$canApprove) {
            if ($request->expectsJson()) {
                return response()->json(['message' => "Role {$roleType} cannot approve a report with status {$report->status}."], 422);
            }
            return back()->withErrors(["Role {$roleType} cannot approve a report with status {$report->status}."]);
        }

        $nextStatus = self::STATUS_AFTER[$data['action']][$roleType] ?? null;
        if (!$nextStatus) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'The combination of action and role is not valid.'], 422);
            }
            return back()->withErrors(['The combination of action and role is not valid.']);
        }

        DB::transaction(function () use ($report, $user, $roleType, $data, $nextStatus) {
            MonthlyReportApproval::create([
                'reportId' => $report->id,
                'approverId' => $user->id,
                'approverRole' => $roleType,
                'action' => $data['action'],
                'note' => $data['note'] ?? null,
            ]);
            $report->update(['status' => $nextStatus]);
        });

        if ($request->expectsJson()) {
            return response()->json(['data' => $report->fresh()]);
        }

        return back()->with('success', "Report {$data['action']}.");
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        $user = $request->user();

        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Only DRAFT reports can be deleted.'], 422);
            }
            return back()->withErrors(['Only DRAFT reports can be deleted.']);
        }
        if ($report->unitId !== $user->unitId && strtoupper($user->roleType) !== 'KADIV') {
            abort(403, "You cannot delete another division's report.");
        }

        $report->delete();
        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('monthly-reports.index')->with('success', 'Report deleted.');
    }

    // ── Excel Parser ──────────────────────────────────────────────────────────

    /**
     * Parse Excel template (port dari parseExcel() di monthly-reports.ts).
     * Kolom: A=Section B=Kategori C=Label D=Satuan E=RKAP F=Realisasi G=TahunLalu
     * Row 1 = header (skip).
     *
     * @return array<int, array{section:string, kategori:string, label:string, satuan:string, rkap:?float, realisasi:?float, tahunLalu:?float, order:int}>
     */
    private function parseExcel(string $filepath): array
    {
        $spreadsheet = IOFactory::load($filepath);

        $sheet = $spreadsheet->getSheetByName('Laporan')
            ?? $spreadsheet->getSheetByName('laporan')
            ?? $spreadsheet->getActiveSheet();

        if (!$sheet) throw new \Exception('No sheet was found in the Excel file.');

        $validSections = ['OPERASIONAL', 'KEUANGAN'];
        $rows = [];
        $order = 0;

        foreach ($sheet->getRowIterator(2) as $row) { // start from row 2 (skip header)
            $cells = $row->getCellIterator('A', 'G');
            $cells->setIterateOnlyExistingCells(false);
            $values = [];
            foreach ($cells as $cell) {
                $values[] = $cell->getFormattedValue();
            }

            $label = trim($values[2] ?? '');
            if ($label === '') continue; // skip blank rows

            $rawSection = strtoupper(trim($values[0] ?? ''));
            $section = in_array($rawSection, $validSections, true) ? $rawSection : 'KEUANGAN';

            $rows[] = [
                'section'   => $section,
                'kategori'  => trim($values[1] ?? ''),
                'label'     => $label,
                'satuan'    => trim($values[3] ?? '') ?: 'Rp Juta',
                'rkap'      => $this->toNum($values[4] ?? null),
                'realisasi' => $this->toNum($values[5] ?? null),
                'tahunLalu' => $this->toNum($values[6] ?? null),
                'order'     => $order++,
            ];
        }

        if (empty($rows)) {
            throw new \Exception('The Excel file contains no data. Make sure the format matches the template.');
        }

        return $rows;
    }

    private function toNum(mixed $value): ?float
    {
        if ($value === null || $value === '' || $value === false) return null;
        $n = (float) str_replace(',', '.', str_replace('.', '', (string) $value));
        return is_finite($n) ? $n : null;
    }
}
