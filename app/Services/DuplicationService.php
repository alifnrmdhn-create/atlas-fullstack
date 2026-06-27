<?php

namespace App\Services;

use App\Models\EntityPic;
use App\Models\KpiDefinition;
use App\Models\KpiValue;
use App\Models\Phase;
use App\Models\Program;
use App\Models\ProgramKpiLink;
use App\Models\SubTask;
use App\Models\Task;
use App\Models\User;
use App\Auth\MembershipResolver;
use App\Models\Workstream;
use Illuminate\Support\Facades\DB;

/**
 * Deep-duplicate ("copy from existing") untuk Program → Workstream → Phase →
 * Task. Aspirasi user 2026-06-27: "saat buat program/alur kerja/tugas baru,
 * bisa copy dari yang sudah ada".
 *
 * Aturan reset (keputusan user): PERTAHANKAN struktur + PIC/assignee, RESET
 * semua progres/status ke awal, BUANG blocker & progress-log. Hasil = kerangka
 * siap pakai, bukan cermin 1:1 yang menyesatkan (progres palsu).
 *
 * Yang DIPERTAHANKAN: hierarki, nama/deskripsi, prioritas, tanggal & timeline
 * (plannedWeeks), PIC program, assignee task, target KPI.
 * Yang DI-RESET: status→awal, progres→0, actualWeeks/actualCompletion→null,
 * isBlocked→false. Yang DIBUANG: Blocker, ProgramProgressLog, WorkItemStatusLog,
 * KpiValue actual (target dipertahankan), dependsOnIds (referensi task lama).
 */
class DuplicationService
{
    public function __construct(
        private MembershipResolver $membershipResolver,
        private TaskService $taskService,
    ) {}

    /** Kode unik bergaya entitas (mirror generator di service/controller lain). */
    private function code(string $prefix): string
    {
        return $prefix . '-' . strtoupper(substr(sha1(uniqid('', true)), 0, 8));
    }

    /** Label salinan — "(Salinan) Nama" tanpa menumpuk prefix berulang. */
    public function copyName(string $name): string
    {
        $base = preg_replace('/^\(Salinan(?:\s\d+)?\)\s*/u', '', $name);
        return '(Salinan) ' . $base;
    }

    /**
     * Deep-duplicate Program lengkap: workstream → phase → task + PIC + link KPI.
     * Program baru selalu DRAFT milik user yang menyalin.
     *
     * @param array{name?:string} $opts
     */
    public function duplicateProgram(User $user, Program $source, array $opts = []): Program
    {
        return DB::transaction(function () use ($user, $source, $opts) {
            $clone = $source->replicate([
                'code', 'progressPercent', 'approvalStatus', 'submittedById',
                'autoHealthComputedAt', 'actualEndDate', 'archivedAt', 'archivedById',
                'linkedChannelId', 'healthStatus', 'rejectionNote',
                'progresTerkini', 'dukunganDibutuhkan',
            ]);
            $clone->name = $opts['name'] ?? $this->copyName($source->name);
            $clone->code = $this->code('PRG');
            $clone->approvalStatus = 'DRAFT';
            $clone->status = 'PLANNING';
            $clone->progressPercent = 0;
            $clone->submittedById = $user->id;
            $clone->autoHealthComputedAt = null;
            // healthStatus DI-RESET — kalau ikut ter-copy, salinan program RED
            // tampil RED padahal DRAFT 0%. Null → di-recompute oleh health service.
            $clone->healthStatus = null;
            // rejectionNote WAJIB di-reset: kalau program sumber pernah ditolak,
            // salinan mewarisi note → activate() & submit terblokir ("baru ditolak,
            // revisi dulu"). Ini blocker alur nyata.
            $clone->rejectionNote = null;
            // Blok "Current Update" (progres terkini + dukungan dibutuhkan) =
            // sepasang narasi keadaan-kini milik sumber → menyesatkan di salinan
            // 0%. Reset keduanya konsisten (di FE pun diedit sebagai pasangan).
            $clone->progresTerkini = null;
            $clone->dukunganDibutuhkan = null;
            $clone->actualEndDate = null;
            $clone->archivedAt = null;
            $clone->archivedById = null;
            $clone->linkedChannelId = null;
            $clone->save();

            // PIC program (EntityPic polimorfik).
            $picIds = $this->picIdsFor('Program', $source->id);
            if (!empty($picIds)) {
                EntityPic::syncForEntity('Program', $clone->id, $picIds);
                // Bust cache membership co-PIC — tanpa ini, co-PIC bisa belum
                // melihat program salinan sampai TTL cache habis (ProgramService::
                // syncProgramPics melakukan hal sama setelah sync EntityPic).
                $this->membershipResolver->invalidateMany($picIds);
            }

            // Link KPI APMS (referensi katalog — murni struktural).
            foreach (ProgramKpiLink::query()->where('programId', $source->id)->get() as $link) {
                ProgramKpiLink::firstOrCreate([
                    'programId'   => $clone->id,
                    'apmsKpiCode' => $link->apmsKpiCode,
                ]);
            }

            // KPI internal (definisi + target dipertahankan, actual di-reset).
            $this->cloneKpiDefinitions($source->id, $clone->id);

            // Struktur kerja.
            foreach (Workstream::query()->where('programId', $source->id)->orderBy('createdAt')->get() as $ws) {
                $this->cloneWorkstreamInto($ws, $clone->id, $user->id, (int) ($clone->ownerUnitId ?? 0) ?: null, $user->unitId);
            }

            return $clone->fresh(['coPics']);
        });
    }

    /**
     * Duplikat satu Workstream beserta Phase + Task-nya ke program tujuan
     * (default: program asal). Return workstream baru.
     */
    public function duplicateWorkstream(User $user, Workstream $source, ?int $targetProgramId = null): Workstream
    {
        $targetProgramId ??= (int) $source->programId;
        $ownerUnitId = Program::query()->where('id', $targetProgramId)->value('ownerUnitId');

        return DB::transaction(fn () => $this->cloneWorkstreamInto(
            $source,
            $targetProgramId,
            $user->id,
            $ownerUnitId !== null ? (int) $ownerUnitId : null,
            $user->unitId,
            $this->copyName($source->name),
        ));
    }

    /** Duplikat satu Phase + Task-nya di dalam workstream yang sama. */
    public function duplicatePhase(User $user, Phase $source): Phase
    {
        return DB::transaction(function () use ($user, $source) {
            $phaseClone = $this->clonePhase($source, (int) $source->initiativeId, $this->copyName($source->name));

            $tasks = Task::query()
                ->where('initiativeId', $source->initiativeId)
                ->where('phaseId', $source->id)
                ->orderBy('letterIndex')
                ->get();
            foreach ($tasks as $task) {
                $this->cloneTaskInto($task, (int) $source->initiativeId, $phaseClone->id, $user->id, $user->unitId);
            }

            // Workstream induk dapat task baru → recompute progress + status rollup
            // (cascade ke program) supaya angka tak basi.
            $this->taskService->recomputeWorkstreamProgress((int) $source->initiativeId);

            return $phaseClone;
        });
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private function cloneWorkstreamInto(
        Workstream $source,
        int $targetProgramId,
        int $actorId,
        ?int $ownerUnitId,
        ?int $actorUnitId,
        ?string $name = null,
    ): Workstream {
        $clone = $source->replicate(['code', 'progressPercent', 'actualCompletion', 'linkedChannelId']);
        $clone->programId = $targetProgramId;
        $clone->name = $name ?? $source->name;
        $clone->code = $this->code('WS');
        $clone->ownerUnitId = $ownerUnitId;
        $clone->status = 'BACKLOG';
        $clone->progressPercent = 0;
        $clone->healthStatus = 'YELLOW';
        $clone->actualCompletion = null;
        // Jangan warisi tautan channel sumber — salinan tak boleh "membajak"
        // channel workstream asal (konsisten dgn reset linkedChannelId di Program).
        $clone->linkedChannelId = null;
        $clone->save();

        // Phase: bangun peta id-lama → id-baru untuk remap phaseId task.
        $phaseMap = [];
        foreach (Phase::query()->where('initiativeId', $source->id)->orderBy('order')->get() as $phase) {
            $phaseMap[$phase->id] = $this->clonePhase($phase, $clone->id)->id;
        }

        foreach (Task::query()->where('initiativeId', $source->id)->orderBy('letterIndex')->get() as $task) {
            $newPhaseId = $task->phaseId ? ($phaseMap[$task->phaseId] ?? null) : null;
            $this->cloneTaskInto($task, $clone->id, $newPhaseId, $actorId, $actorUnitId);
        }

        // Selaraskan progress + status rollup (workstream/phase) dari task baru.
        $this->taskService->recomputeWorkstreamProgress($clone->id);

        return $clone;
    }

    private function clonePhase(Phase $source, int $targetWorkstreamId, ?string $name = null): Phase
    {
        $clone = $source->replicate(['code']);
        $clone->initiativeId = $targetWorkstreamId;
        $clone->name = $name ?? $source->name;
        $clone->code = $this->code('PH');
        $clone->status = 'PLANNING';
        $clone->healthStatus = 'YELLOW';
        $clone->save();
        return $clone;
    }

    private function cloneTaskInto(Task $source, int $targetWorkstreamId, ?int $targetPhaseId, int $actorId, ?int $actorUnitId = null): Task
    {
        $clone = $source->replicate([
            'code', 'percentComplete', 'actualCompletion', 'actualWeeks',
            'isBlocked', 'blockedReason', 'dependsOnIds',
            // Keadaan-kini / eksekusi yang TAK boleh diwarisi salinan:
            'actualHours',     // jam kerja aktual = progres
            'healthStatus',    // health basi sumber (mis. RED)
            'linkedThreadId',  // tautan thread chat sumber — jangan dibajak
        ]);
        $clone->initiativeId = $targetWorkstreamId;
        $clone->phaseId = $targetPhaseId;
        $clone->code = $this->code('WI');
        $clone->status = 'BACKLOG';
        $clone->percentComplete = 0;
        $clone->actualCompletion = null;
        $clone->actualWeeks = null;
        $clone->actualHours = null;
        $clone->healthStatus = null;
        $clone->linkedThreadId = null;
        $clone->isBlocked = false;
        $clone->blockedReason = null;
        // dependsOnIds menunjuk task lama → tak valid di salinan; dikosongkan.
        $clone->dependsOnIds = null;
        $clone->createdBy = $actorId;
        $clone->createdByUnitId = $actorUnitId;
        $clone->save();

        // Assignee (Task.assignedTo) ikut ter-replicate; mirror ke EntityPic
        // supaya panel detail (baca picPersonIds) konsisten. Invariant
        // assignedTo === picPersonIds[0] dijaga.
        $picIds = $this->picIdsFor('WorkItem', $source->id);
        if (empty($picIds) && $clone->assignedTo) {
            $picIds = [(int) $clone->assignedTo];
        }
        if (!empty($picIds)) {
            EntityPic::syncForEntity('WorkItem', $clone->id, $picIds);
        }

        // SubTask (checklist) = bagian struktur task → ikut tersalin, progres
        // di-reset (PENDING, belum selesai). Tanpa ini, menduplikat task berisi
        // checklist kehilangan checklist-nya (clone tak lengkap).
        foreach (SubTask::query()->where('workItemId', $source->id)->get() as $sub) {
            $subClone = $sub->replicate(['status', 'isCompleted', 'completedAt']);
            $subClone->workItemId = $clone->id;
            $subClone->status = 'PENDING';
            $subClone->isCompleted = false;
            $subClone->completedAt = null;
            $subClone->save();
        }

        return $clone;
    }

    /** Clone KpiDefinition + KpiValue: target dipertahankan, actual di-reset. */
    private function cloneKpiDefinitions(int $sourceProgramId, int $targetProgramId): void
    {
        $defs = KpiDefinition::query()->where('programId', $sourceProgramId)->get();
        foreach ($defs as $def) {
            $defClone = $def->replicate([
                'actualValue', 'lastMeasuredDate', 'initiativeId', 'leadingIndicatorFor',
            ]);
            $defClone->programId = $targetProgramId;
            $defClone->actualValue = null;
            $defClone->lastMeasuredDate = null;
            // initiativeId & leadingIndicatorFor menunjuk workstream/KPI milik
            // SUMBER → kalau diwarisi, KPI salinan bocor lintas-program. Defensif:
            // di-null-kan (kini selalu null di data; cegah bug laten). KPI tetap
            // ter-scope ke program (programId) — degradasi aman.
            $defClone->initiativeId = null;
            $defClone->leadingIndicatorFor = null;
            $defClone->save();

            foreach (KpiValue::query()->where('kpiDefinitionId', $def->id)->get() as $val) {
                $valClone = $val->replicate(['actualValue', 'variance', 'variancePercent']);
                $valClone->kpiDefinitionId = $defClone->id;
                // actualValue NOT NULL di skema → reset ke 0 (bukan null).
                $valClone->actualValue = 0;
                $valClone->variance = null;
                $valClone->variancePercent = null;
                $valClone->save();
            }
        }
    }

    /** @return array<int,int> userId PIC untuk entitas polimorfik. */
    private function picIdsFor(string $entityType, int $entityId): array
    {
        return EntityPic::query()
            ->where('entityType', $entityType)
            ->where('entityId', $entityId)
            ->pluck('userId')
            ->map(fn ($id) => (int) $id)
            ->all();
    }
}
