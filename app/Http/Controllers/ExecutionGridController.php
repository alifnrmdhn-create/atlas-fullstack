<?php

namespace App\Http\Controllers;

use App\Models\OrganizationalUnit;
use App\Models\Phase;
use App\Models\Program;
use App\Models\Task;
use App\Models\User;
use App\Models\Workstream;
use App\Services\ProgramService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ExecutionGridController extends Controller
{
    public function __construct(private ProgramService $programService) {}

    // ── GET /programs/execution-matrix ───────────────────────────────────────

    public function executionMatrix(Request $request): JsonResponse
    {
        $user = $request->user();
        $weeksCount = max(1, min(12, (int) $request->query('weeks', 7)));

        // Generate week range: centerWeek adalah minggu ini, extend weeksCount/2 ke kiri dan kanan
        $currentWeek = now()->format('o-\WW');
        $pivot = Carbon::now()->startOfWeek(Carbon::MONDAY);
        $halfLeft = (int) floor($weeksCount / 2);

        $weeks = [];
        $cursor = $pivot->copy()->subWeeks($halfLeft);
        for ($i = 0; $i < $weeksCount; $i++) {
            $weeks[] = $cursor->format('o-\WW');
            $cursor->addWeek();
        }

        $programs = collect($this->programService->listForUser($user))
            ->filter(fn ($p) => in_array($p->approvalStatus ?? '', ['ACTIVE'], true))
            ->values();

        $result = [];
        foreach ($programs as $prog) {
            $tasks = Task::query()
                ->whereHas('workstream', fn ($q) => $q->where('programId', $prog->id))
                ->get(['id', 'plannedWeeks', 'actualWeeks', 'status']);

            $weekCells = [];
            foreach ($weeks as $week) {
                $weekIsPast = $week < $currentWeek;
                $hasActual  = false;
                $hasPlan    = false;

                foreach ($tasks as $task) {
                    $planned = $task->plannedWeeks ?? [];
                    $stored  = $task->actualWeeks;
                    // null = auto-derive dari status; array kosong/isi = manual
                    $actual  = $stored === null
                        ? (in_array($task->status, ['COMPLETED', 'IN_REVIEW'], true) ? $planned : [])
                        : $stored;
                    if (in_array($week, $planned, true)) $hasPlan   = true;
                    if (in_array($week, $actual, true))  $hasActual  = true;
                }

                // Determine cell tone
                if (!$hasPlan && !$hasActual) {
                    $tone = 'empty';       // abu — tidak ada plan
                } elseif ($hasActual) {
                    $tone = 'done';        // hijau
                } elseif ($hasPlan && !$weekIsPast) {
                    $tone = 'planned';     // kuning — ada plan, belum actual, belum lewat
                } else {
                    $tone = 'gap';         // merah — seharusnya ada (sudah lewat) tapi kosong
                }

                $weekCells[] = ['week' => $week, 'tone' => $tone, 'hasPlan' => $hasPlan, 'hasActual' => $hasActual];
            }

            $result[] = [
                'id'              => $prog->id,
                'code'            => $prog->code,
                'name'            => $prog->name,
                'healthStatus'    => $prog->healthStatus,
                'progressPercent' => $prog->progressPercent ?? 0,
                'weeks'           => $weekCells,
            ];
        }

        return response()->json([
            'data'        => $result,
            'weeks'       => $weeks,
            'currentWeek' => $currentWeek,
        ]);
    }

    // ── GET /programs/{id}/execution-grid?workstreamId={wsId} ────────────────

    public function executionGrid(Request $request, int $programId): JsonResponse
    {
        $this->programService->assertAccess($request->user(), $programId);

        $workstreamId = (int) $request->query('workstreamId');
        if (!$workstreamId) {
            return response()->json(['message' => 'workstreamId diperlukan.'], 422);
        }

        $program = Program::query()
            ->where('id', $programId)
            ->first(['id', 'code', 'name', 'startDate', 'targetEndDate']);

        if (!$program) abort(404);

        $workstream = Workstream::query()
            ->where('id', $workstreamId)
            ->where('programId', $programId)
            ->with(['owner:id,name'])
            ->first();

        if (!$workstream) abort(404, 'Workstream tidak ditemukan di program ini.');

        // Load phases ordered
        $phases = Phase::query()
            ->where('initiativeId', $workstreamId)
            ->with(['entityPics.user:id,name'])
            ->orderBy('order')
            ->get();

        // Load tasks for this workstream
        $tasks = Task::query()
            ->where('initiativeId', $workstreamId)
            ->with([
                'entityPics.user:id,name',
                'blockers' => fn ($q) => $q->where('status', 'OPEN')->select('id', 'workItemId', 'severity'),
            ])
            ->orderBy('phaseId')
            ->orderBy('letterIndex')
            ->orderBy('createdAt')
            ->get();

        // Collect all unit IDs referenced by phases and tasks
        $allUnitIds = collect();
        foreach ($phases as $phase) {
            $allUnitIds = $allUnitIds->merge($phase->picUnitIds ?? []);
        }
        foreach ($tasks as $task) {
            $allUnitIds = $allUnitIds->merge($task->picUnitIds ?? []);
        }
        $unitMap = $allUnitIds->unique()->filter()->isNotEmpty()
            ? OrganizationalUnit::query()
                ->whereIn('id', $allUnitIds->unique()->filter()->values())
                ->get(['id', 'name', 'code'])
                ->keyBy('id')
            : collect();

        // Compute week range
        $startDate = $program->startDate ?? now()->startOfYear();
        $endDate   = $program->targetEndDate ?? now()->endOfYear();

        // Pad: start from Monday of startDate's week, end at Sunday of endDate's week + 4 weeks
        $rangeStart = Carbon::parse($startDate)->startOfWeek(Carbon::MONDAY);
        $rangeEnd   = Carbon::parse($endDate)->endOfWeek(Carbon::SUNDAY)->addWeeks(4);

        $weeks = [];
        $cursor = $rangeStart->copy();
        while ($cursor->lte($rangeEnd)) {
            $weeks[] = $cursor->format('o-\WW');
            $cursor->addWeek();
        }

        $currentWeek = now()->format('o-\WW');

        // Build month headers
        $monthHeaders = $this->buildMonthHeaders($weeks);

        // Build phase map: phaseId → phase row
        $phaseMap = $phases->keyBy('id');

        // Group tasks by phaseId
        $tasksByPhase = $tasks->groupBy(fn ($t) => $t->phaseId ?? '__unphased__');

        // Build phase blocks
        $phaseBlocks = $phases->map(fn ($phase) => [
            'id'          => $phase->id,
            'code'        => $phase->code ?? ('FASE-' . $phase->order),
            'order'       => $phase->order,
            'name'        => $phase->name,
            'description' => $phase->description ?? null,
            'status'      => $phase->status ?? 'PENDING',
            'color'       => $phase->color ?? null,
            'healthStatus'=> $phase->healthStatus ?? null,
            'startWeek'   => $phase->startWeek ?? null,
            'endWeek'     => $phase->endWeek ?? null,
            'picUnits'    => $this->resolveUnits($phase->picUnitIds ?? [], $unitMap),
            'picPersons'  => $this->resolvePersons($phase->entityPics),
            'steps'       => $this->buildSteps(
                $tasksByPhase->get($phase->id) ?? collect(),
                $weeks,
                $unitMap,
            ),
        ])->values()->all();

        // Unphased tasks
        $unphasedSteps = $this->buildSteps(
            $tasksByPhase->get('__unphased__') ?? collect(),
            $weeks,
            $unitMap,
        );

        return response()->json([
            'data' => [
                'program' => [
                    'id'   => $program->id,
                    'code' => $program->code,
                    'name' => $program->name,
                ],
                'workstream' => [
                    'id'             => $workstream->id,
                    'code'           => $workstream->code,
                    'name'           => $workstream->name,
                    'description'    => $workstream->description ?? null,
                    'status'         => $workstream->status,
                    'healthStatus'   => $workstream->healthStatus ?? null,
                    'progressPercent'=> $workstream->progressPercent ?? 0,
                    'owner'          => $workstream->owner
                        ? ['id' => $workstream->owner->id, 'name' => $workstream->owner->name]
                        : null,
                ],
                'weekRange'    => ['startWeek' => $weeks[0] ?? $currentWeek, 'endWeek' => $weeks[count($weeks) - 1] ?? $currentWeek, 'weeks' => $weeks],
                'monthHeaders' => $monthHeaders,
                'currentWeek'  => $currentWeek,
                'phases'       => $phaseBlocks,
                'unphasedSteps'=> $unphasedSteps,
            ],
        ]);
    }

    // ── GET /programs/{id}/execution-grid.xlsx ───────────────────────────────

    public function exportXlsx(Request $request, int $programId): Response
    {
        $this->programService->assertAccess($request->user(), $programId);

        $workstreamId = (int) $request->query('workstreamId');
        if (!$workstreamId) abort(422, 'workstreamId diperlukan.');

        // Reuse grid logic
        $gridResponse = $this->executionGrid($request, $programId);
        $data = json_decode($gridResponse->getContent(), true)['data'];

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Jadwal Mingguan');

        $weeks = $data['weekRange']['weeks'];
        $totalCols = 6 + count($weeks); // Fase|Uraian|PIC Unit|Person|Tipe|Status|weeks...

        // ── Header row ───────────────────────────────────────────────────────
        $headers = ['Fase', 'Uraian Tahapan', 'PIC (Divisi)', 'Person', 'Tipe', 'Status', ...$weeks];
        $sheet->fromArray([$headers], null, 'A1');
        $sheet->getStyle('A1:' . \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($totalCols) . '1')
            ->getFont()->setBold(true);
        $sheet->getStyle('A1:' . \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($totalCols) . '1')
            ->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('1a1a2e');
        $sheet->getStyle('A1:' . \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($totalCols) . '1')
            ->getFont()->getColor()->setRGB('FFFFFF');

        $row = 2;

        $writeStep = function (string $phaseLabel, array $step) use ($sheet, $weeks, &$row) {
            $units   = implode(' / ', array_map(fn ($u) => $u['shortName'] ?? $u['name'], $step['picUnits']));
            $persons = implode(' / ', array_map(fn ($p) => $p['name'], $step['picPersons']))
                ?: ($step['primaryAssignee']['name'] ?? '');
            $letter  = $step['letterIndex'] ?? '';

            // Plan row
            $sheet->setCellValue("A{$row}", $phaseLabel);
            $sheet->setCellValue("B{$row}", trim("{$letter} {$step['title']}"));
            $sheet->setCellValue("C{$row}", $units);
            $sheet->setCellValue("D{$row}", $persons);
            $sheet->setCellValue("E{$row}", 'Plan');
            $sheet->setCellValue("F{$row}", $step['status']);
            foreach ($weeks as $i => $w) {
                $col = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(7 + $i);
                if (in_array($w, $step['plannedWeeks'], true)) {
                    $sheet->setCellValue("{$col}{$row}", '■');
                    $sheet->getStyle("{$col}{$row}")->getFont()->getColor()->setRGB('1a6cf5');
                }
            }
            $row++;

            // Real row
            $sheet->setCellValue("E{$row}", 'Real');
            $sheet->setCellValue("F{$row}", $step['actualDerived'] ? 'auto' : 'manual');
            foreach ($weeks as $i => $w) {
                $col = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(7 + $i);
                if (in_array($w, $step['actualWeeks'], true)) {
                    $sheet->setCellValue("{$col}{$row}", '■');
                    $sheet->getStyle("{$col}{$row}")->getFont()->getColor()->setRGB('16a34a');
                }
            }
            $row++;
        };

        foreach ($data['phases'] as $phase) {
            $phaseLabel = "{$phase['order']}. {$phase['name']}";
            foreach ($phase['steps'] as $step) {
                $writeStep($phaseLabel, $step);
            }
        }
        foreach ($data['unphasedSteps'] as $step) {
            $writeStep('—', $step);
        }

        // Auto-size first few columns
        foreach (['A', 'B', 'C', 'D', 'E', 'F'] as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }
        // Narrow week columns
        for ($i = 1; $i <= count($weeks); $i++) {
            $col = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(6 + $i);
            $sheet->getColumnDimension($col)->setWidth(4);
        }

        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');
        $content = ob_get_clean();

        $progCode = preg_replace('/[^a-zA-Z0-9\-_]/', '_', $data['program']['code'] ?? 'program');
        $wsName   = preg_replace('/[^a-zA-Z0-9\-_]/', '_', substr($data['workstream']['name'] ?? 'ws', 0, 40));
        $filename = "JadwalMingguan_{$progCode}_{$wsName}.xlsx";

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Cache-Control' => 'no-cache',
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function buildSteps(iterable $tasks, array $weeks, $unitMap): array
    {
        $steps = [];
        foreach ($tasks as $task) {
            $storedActual  = $task->actualWeeks; // null = auto-derive, [] or [...] = manual
            $actualDerived = $storedActual === null;

            if ($actualDerived) {
                $actualWeeks = in_array($task->status, ['COMPLETED', 'IN_REVIEW'], true)
                    ? ($task->plannedWeeks ?? [])
                    : [];
            } else {
                $actualWeeks = $storedActual ?? [];
            }

            $steps[] = [
                'id'              => $task->id,
                'code'            => $task->code ?? ('TASK-' . $task->id),
                'letterIndex'     => $task->letterIndex ?? null,
                'title'           => $task->title,
                'description'     => $task->description ?? null,
                'output'          => $task->output ?? null,
                'status'          => $task->status,
                'isBlocked'       => (bool) $task->isBlocked,
                'blockedReason'   => $task->blockedReason ?? null,
                'percentComplete' => (int) ($task->percentComplete ?? 0),
                'healthStatus'    => $task->healthStatus ?? null,
                'primaryAssignee' => $task->assignedTo
                    ? ['id' => $task->assignedTo, 'name' => $task->assignee?->name ?? '—']
                    : null,
                'picUnits'        => $this->resolveUnits($task->picUnitIds ?? [], $unitMap),
                'picPersons'      => $this->resolvePersons($task->entityPics),
                'plannedWeeks'    => $task->plannedWeeks ?? [],
                'actualWeeks'     => $actualWeeks,
                'actualDerived'   => $actualDerived,
            ];
        }
        return $steps;
    }

    private function resolveUnits(array $unitIds, $unitMap): array
    {
        return collect($unitIds)
            ->filter()
            ->map(fn ($id) => $unitMap->get($id))
            ->filter()
            ->map(fn ($u) => [
                'id'        => $u->id,
                'name'      => $u->name,
                'shortName' => $u->shortName ?? $u->code ?? null,
            ])
            ->values()
            ->all();
    }

    private function resolvePersons($entityPics): array
    {
        if (!$entityPics) return [];
        return collect($entityPics)
            ->filter(fn ($ep) => $ep->user !== null)
            ->map(fn ($ep) => [
                'id'   => $ep->userId,
                'name' => $ep->user->name,
            ])
            ->values()
            ->all();
    }

    private function buildMonthHeaders(array $weeks): array
    {
        $months = [];
        $MONTH_ID = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

        foreach ($weeks as $iso) {
            $date = $this->isoWeekToDate($iso);
            $monthIndex = (int) $date->format('n');
            $year = (int) $date->format('Y');
            $key = "{$year}-{$monthIndex}";

            if (!isset($months[$key])) {
                $months[$key] = [
                    'month'      => $MONTH_ID[$monthIndex],
                    'year'       => $year,
                    'monthIndex' => $monthIndex,
                    'weeks'      => [],
                ];
            }
            $months[$key]['weeks'][] = [
                'iso'     => $iso,
                'ordinal' => (int) ceil($date->format('j') / 7),
                'label'   => 'W' . ceil($date->format('j') / 7),
            ];
        }

        return array_values($months);
    }

    private function isoWeekToDate(string $iso): Carbon
    {
        [$year, $week] = sscanf($iso, '%d-W%d');
        return Carbon::now()->setISODate((int) $year, (int) $week, 1);
    }
}
