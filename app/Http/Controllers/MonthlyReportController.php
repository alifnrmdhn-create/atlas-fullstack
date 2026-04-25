<?php

namespace App\Http\Controllers;

use App\Models\MonthlyReport;
use App\Models\MonthlyReportApproval;
use App\Models\MonthlyReportFile;
use App\Models\MonthlyReportMetric;
use App\Models\Program;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

    public function show(Request $request, int $id)
    {
        $report = MonthlyReport::with([
            'unit:id,code,name',
            'submittedBy:id,name',
            'metrics',
            'files.uploadedBy:id,name',
            'approvals.approver:id,name,roleType',
        ])->findOrFail($id);

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

    // ── Mutations ────────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse|RedirectResponse
    {
        $user = $request->user();
        if (!$user->unitId) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'User tidak terdaftar di unit manapun.'], 422);
            }
            return back()->withErrors(['User tidak terdaftar di unit manapun.']);
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
                return response()->json(['message' => "Laporan {$data['month']}/{$data['year']} untuk divisi ini sudah ada (status: {$existing->status})."], 422);
            }
            return back()->withErrors(["Laporan {$data['month']}/{$data['year']} untuk divisi ini sudah ada (status: {$existing->status})."]);
        }

        $linkedIds = $data['linkedProgramIds'] ?? [];
        if (!empty($linkedIds)) {
            $planning = Program::whereIn('id', $linkedIds)
                ->whereIn('approvalStatus', ['DRAFT', 'PENDING_KASUB', 'PENDING_KADIV'])
                ->get(['code']);
            if ($planning->isNotEmpty()) {
                $codes = $planning->pluck('code')->join(', ');
                if ($request->expectsJson()) {
                    return response()->json(['message' => "Program berikut masih dalam fase Perencanaan: {$codes}"], 422);
                }
                return back()->withErrors(["Program berikut masih dalam fase Perencanaan: {$codes}"]);
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

        return redirect()->route('monthly-reports.show', $report->id)->with('success', 'Laporan dibuat.');
    }

    public function update(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Hanya laporan DRAFT yang bisa diedit.'], 422);
            }
            return back()->withErrors(['Hanya laporan DRAFT yang bisa diedit.']);
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

        return back()->with('success', 'Laporan diperbarui.');
    }

    /**
     * Upload Excel → parse → replace semua metrics.
     * Format sheet: A=Section B=Kategori C=Label D=Satuan E=RKAP F=Realisasi G=TahunLalu
     */
    public function upload(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Hanya laporan DRAFT yang bisa diupdate.'], 422);
            }
            return back()->withErrors(['Hanya laporan DRAFT yang bisa diupdate.']);
        }

        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls|max:10240',
        ]);

        $file = $request->file('file');
        $storedName = 'report-' . time() . '-' . bin2hex(random_bytes(8)) . '.' . $file->getClientOriginalExtension();
        $storedPath = "reports/{$storedName}";
        Storage::disk('local')->putFileAs('reports', $file, $storedName);

        $fullPath = Storage::disk('local')->path($storedPath);

        try {
            $metrics = $this->parseExcel($fullPath);
        } catch (\Exception $e) {
            Storage::disk('local')->delete($storedPath);
            if ($request->expectsJson()) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
            return back()->withErrors([$e->getMessage()]);
        }

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

        return back()->with('success', 'Data Excel berhasil diimport (' . count($metrics) . ' baris).');
    }

    public function submit(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::withCount('metrics')->findOrFail($id);
        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Hanya laporan DRAFT yang bisa disubmit.'], 422);
            }
            return back()->withErrors(['Hanya laporan DRAFT yang bisa disubmit.']);
        }
        if ($report->metrics_count === 0) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Upload data Excel terlebih dahulu sebelum submit.'], 422);
            }
            return back()->withErrors(['Upload data Excel terlebih dahulu sebelum submit.']);
        }

        $report->update([
            'status' => 'SUBMITTED',
            'submittedById' => $request->user()->id,
            'submittedAt' => now(),
        ]);

        if ($request->expectsJson()) {
            return response()->json(['data' => $report->fresh()]);
        }

        return back()->with('success', 'Laporan disubmit.');
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

        $canApprove = ($roleType === 'KASUBDIV' && $report->status === 'SUBMITTED')
                   || ($roleType === 'KADIV' && $report->status === 'REVIEWED');

        if (!$canApprove) {
            if ($request->expectsJson()) {
                return response()->json(['message' => "Role {$roleType} tidak bisa melakukan approval pada laporan dengan status {$report->status}."], 422);
            }
            return back()->withErrors(["Role {$roleType} tidak bisa melakukan approval pada laporan dengan status {$report->status}."]);
        }

        $nextStatus = self::STATUS_AFTER[$data['action']][$roleType] ?? null;
        if (!$nextStatus) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Kombinasi action dan role tidak valid.'], 422);
            }
            return back()->withErrors(['Kombinasi action dan role tidak valid.']);
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

        return back()->with('success', "Laporan {$data['action']}.");
    }

    public function destroy(Request $request, int $id): JsonResponse|RedirectResponse
    {
        $report = MonthlyReport::findOrFail($id);
        $user = $request->user();

        if ($report->status !== 'DRAFT') {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Hanya laporan DRAFT yang bisa dihapus.'], 422);
            }
            return back()->withErrors(['Hanya laporan DRAFT yang bisa dihapus.']);
        }
        if ($report->unitId !== $user->unitId && strtoupper($user->roleType) !== 'KADIV') {
            abort(403, 'Tidak bisa menghapus laporan divisi lain.');
        }

        $report->delete();
        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return redirect()->route('monthly-reports.index')->with('success', 'Laporan dihapus.');
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

        if (!$sheet) throw new \Exception('Tidak ditemukan sheet di file Excel.');

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
            throw new \Exception('File Excel tidak mengandung data. Pastikan format sesuai template.');
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
