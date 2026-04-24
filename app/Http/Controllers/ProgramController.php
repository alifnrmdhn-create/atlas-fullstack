<?php

namespace App\Http\Controllers;

use App\Models\Blocker;
use App\Models\KpiDefinition;
use App\Models\Program;
use App\Models\ProgramKpiLink;
use App\Services\ProgramHealthService;
use App\Services\ProgramService;
use App\Support\RolePolicy;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ProgramController extends Controller
{
    public function __construct(
        private ProgramService $programService,
        private ProgramHealthService $healthService,
    ) {}

    // ── Pages ────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $programs = $this->programService->listForUser($request->user());
        return Inertia::render('ProgramsView', [
            'programs' => $programs,
        ]);
    }

    public function archived(Request $request): Response
    {
        Gate::authorize('view-archive');
        $programs = $this->programService->listArchived($request->user());
        return Inertia::render('Programs/Archived', ['programs' => $programs]);
    }

    public function show(Request $request, int $id): Response
    {
        $this->programService->assertAccess($request->user(), $id);
        $program = $this->programService->findOrFail($id);
        return Inertia::render('ProgramDetailView', ['program' => $program]);
    }

    // ── API-style JSON endpoints (Inertia router calls these via router.get()) ──

    public function timelineAll(Request $request)
    {
        return response()->json([
            'data' => $this->programService->timelineAll($request->user()),
        ]);
    }

    public function executionPulse(Request $request)
    {
        return response()->json([
            'data' => $this->programService->executionPulse($request->user()),
        ]);
    }

    public function health(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        $program = Program::query()->where('id', $id)->first(['healthStatus', 'progressPercent']);
        $kpis = KpiDefinition::query()
            ->where('programId', $id)
            ->whereNotNull('actualValue')
            ->get(['actualValue', 'targetValue', 'warningThreshold', 'criticalThreshold']);

        $redCount = $yellowCount = 0;
        foreach ($kpis as $k) {
            $actual = (float) $k->actualValue;
            $target = (float) $k->targetValue;
            $critical = $k->criticalThreshold !== null ? (float) $k->criticalThreshold : $target * 0.8;
            $warning  = $k->warningThreshold  !== null ? (float) $k->warningThreshold  : $target * 0.95;
            if ($actual <= $critical) $redCount++;
            elseif ($actual <= $warning) $yellowCount++;
        }

        $kpiHealth = $kpis->isEmpty() ? null
            : ($redCount >= 2 ? 'RED'
            : ($redCount >= 1 || $yellowCount >= 1 ? 'YELLOW' : 'GREEN'));

        return response()->json(['data' => [
            'programId' => $id,
            'healthStatus' => $program?->healthStatus ?? 'YELLOW',
            'progressPercent' => $program?->progressPercent ?? 0,
            'kpiHealth' => $kpiHealth,
            'kpiTotal' => $kpis->count(),
            'kpiRedCount' => $redCount,
            'kpiYellowCount' => $yellowCount,
        ]]);
    }

    public function workstreams(Request $request, int $id)
    {
        $this->programService->assertAccess($request->user(), $id);
        return response()->json([
            'data' => $this->programService->workstreamsForGrid($id),
        ]);
    }

    public function kpiLinks(Request $request, int $id)
    {
        $links = ProgramKpiLink::query()->where('programId', $id)->orderBy('createdAt')->get();
        return response()->json(['data' => $links]);
    }

    // ── Mutations ─────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        Gate::authorize('create-program');

        $data = $request->validate([
            'name' => 'required|string|max:200',
            'description' => 'nullable|string|max:2000',
            'strategicObjective' => 'nullable|string|max:1000',
            'startDate' => 'required|date',
            'targetEndDate' => 'required|date|after:startDate',
            'priority' => 'in:LOW,MEDIUM,HIGH,CRITICAL',
            'ownerUnitId' => 'nullable|integer',
            'budgetIdr' => 'nullable|numeric',
        ]);

        $program = $this->programService->create($request->user(), $data);

        return redirect()->route('programs.show', $program->id)
            ->with('success', 'Program berhasil dibuat.');
    }

    public function update(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('edit-program', $program);

        $isAdmin = RolePolicy::isAdminOrAbove($request->user()->roleType);
        if (!$isAdmin && in_array($program->approvalStatus, ['PENDING_KASUB', 'PENDING_KADIV'], true)) {
            return back()->withErrors(['Program sedang dalam proses persetujuan dan tidak dapat diubah.']);
        }

        $data = $request->validate([
            'name' => 'sometimes|string|max:200',
            'description' => 'nullable|string|max:2000',
            'strategicObjective' => 'nullable|string|max:1000',
            'startDate' => 'sometimes|date',
            'targetEndDate' => 'sometimes|date',
            'priority' => 'sometimes|in:LOW,MEDIUM,HIGH,CRITICAL',
            'budgetIdr' => 'nullable|numeric',
            'picPersonIds' => 'nullable|array',
            'picPersonIds.*' => 'integer',
        ]);

        $this->programService->update($id, $data);

        return back()->with('success', 'Program diperbarui.');
    }

    public function destroy(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('delete-program', $program);
        $this->programService->delete($id);
        return redirect()->route('programs.index')->with('success', 'Program dihapus.');
    }

    public function submit(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        $user = $request->user();
        $role = strtoupper($user->roleType);

        if (!in_array($user->id, [$program->submittedById, $program->ownerId], true)
            && !in_array($role, ['SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Hanya PIC atau pembuat program yang dapat mengajukan persetujuan');
        }
        if ($program->approvalStatus !== 'DRAFT') {
            return back()->withErrors(['Hanya program berstatus DRAFT yang dapat disubmit.']);
        }
        if (in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            return back()->withErrors(['KADIV/Admin gunakan tombol "Mulai Eksekusi" untuk mengaktifkan program.']);
        }

        $nextStatus = $role === 'KASUBDIV' ? 'PENDING_KADIV' : 'PENDING_KASUB';
        $program->update(['approvalStatus' => $nextStatus, 'rejectionNote' => null, 'submittedById' => $user->id]);

        return back()->with('success', "Program diajukan untuk persetujuan.");
    }

    public function activate(Request $request, int $id): RedirectResponse
    {
        $role = strtoupper($request->user()->roleType);
        if (!in_array($role, ['KADIV', 'SUPERADMIN', 'ADMIN'], true)) {
            abort(403, 'Hanya KADIV/Admin yang dapat mengaktifkan program langsung.');
        }
        $program = Program::findOrFail($id);
        if ($program->approvalStatus !== 'DRAFT') {
            return back()->withErrors(['Hanya program DRAFT yang dapat diaktifkan.']);
        }
        $program->update(['approvalStatus' => 'ACTIVE', 'rejectionNote' => null]);
        return back()->with('success', 'Program diaktifkan — eksekusi dimulai.');
    }

    public function approve(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        $role = strtoupper($request->user()->roleType);

        if ($program->approvalStatus === 'PENDING_KASUB' && $role === 'KASUBDIV') {
            $program->update(['approvalStatus' => 'PENDING_KADIV']);
        } elseif ($program->approvalStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true)) {
            $program->update(['approvalStatus' => 'ACTIVE']);
        } else {
            abort(403, 'Anda tidak memiliki izin untuk menyetujui program ini pada tahap ini');
        }

        return back()->with('success', 'Program disetujui.');
    }

    public function reject(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        $role = strtoupper($request->user()->roleType);

        $data = $request->validate(['note' => 'required|string|max:400']);

        $canReject =
            ($program->approvalStatus === 'PENDING_KASUB' && $role === 'KASUBDIV') ||
            ($program->approvalStatus === 'PENDING_KADIV' && in_array($role, ['KADIV', 'ADMIN', 'SUPERADMIN'], true));

        if (!$canReject) abort(403, 'Anda tidak memiliki izin untuk menolak program ini');

        $program->update(['approvalStatus' => 'DRAFT', 'rejectionNote' => $data['note']]);
        return back()->with('success', 'Program ditolak dan dikembalikan ke Draft.');
    }

    public function archive(Request $request, int $id): RedirectResponse
    {
        $program = Program::findOrFail($id);
        Gate::authorize('archive-program', $program);
        if ($program->archivedAt) return back()->withErrors(['Program sudah diarsipkan.']);
        $this->programService->archive($id, $request->user()->id);
        return back()->with('success', 'Program diarsipkan.');
    }

    public function restore(Request $request, int $id): RedirectResponse
    {
        Gate::authorize('view-archive');
        $program = Program::findOrFail($id);
        if (!$program->archivedAt) return back()->withErrors(['Program tidak dalam status arsip.']);
        $this->programService->restore($id);
        return back()->with('success', 'Program dipulihkan.');
    }

    public function addKpiLink(Request $request, int $id): RedirectResponse
    {
        $data = $request->validate([
            'apmsKpiCode' => 'required|string|max:30',
            'note' => 'nullable|string|max:200',
            'apmsKpiName' => 'nullable|string|max:200',
            'apmsKpiBobot' => 'nullable|numeric',
        ]);

        $exists = ProgramKpiLink::query()
            ->where('programId', $id)
            ->where('apmsKpiCode', $data['apmsKpiCode'])
            ->exists();

        if ($exists) return back()->withErrors(["KPI {$data['apmsKpiCode']} sudah terhubung ke program ini."]);

        ProgramKpiLink::create([...$data, 'programId' => $id]);
        return back()->with('success', 'KPI dihubungkan.');
    }

    public function removeKpiLink(Request $request, int $id, string $code): RedirectResponse
    {
        ProgramKpiLink::query()
            ->where('programId', $id)
            ->where('apmsKpiCode', $code)
            ->delete();

        return back()->with('success', 'Link KPI dihapus.');
    }
}
