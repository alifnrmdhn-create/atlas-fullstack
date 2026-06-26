<?php

namespace Database\Seeders;

use App\Enums\Kelompok;
use App\Enums\PilarStrategis;
use App\Models\Program;
use App\Models\Task;
use App\Models\Workstream;
use Carbon\Carbon;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seed 97 program kerja strategis DKMR 2026.
 *
 * SUMBER TUNGGAL (single source of truth):
 *   docs/2026_MEI_Monitoring Program Kerja DKMR 220626.pdf
 * Tabel "Monitoring Program Kerja Strategis DKMR" per divisi (hlm 52-72)
 * ditranskripsi verbatim ke database/seeders/data/programs_dkmr_2026.json.
 * PIC asli & Mitra Suksesor (co-PIC) di-enrich dari sheet "Sd 22 Mei" file
 * docs/Monitoring Program Kerja DKMR 220626.xlsx (sumber digital yang sama).
 *
 * Granularitas: tiap baris bernomor di PDF = 1 Program + 1 Workstream + 1 Task
 * (milestone/output baris tsb). Total 48 DKSA + 27 DAPN + 22 DIMR = 97.
 *
 * IDEMPOTENT: meng-DELETE seluruh "Program" lebih dulu — FK ON DELETE CASCADE
 * membersihkan Initiative/WorkItem/KpiDefinition/ProgramKpiLink/log otomatis.
 * Assignment & EscalationRequest TIDAK terhapus (relasinya ON DELETE SET NULL).
 * Aman dijalankan berulang. Jalankan: php artisan db:seed --class=ProgramSeeder
 */
class ProgramSeeder extends Seeder
{
    use WithoutModelEvents;

    /** Divisi DIR-KMR → [organizationalUnitId, ownerId (kepala divisi)]. */
    private const DIV = [
        'DKSA' => ['unitId' => 14, 'ownerId' => 150], // Keuangan Strategis & Anggaran
        'DAPN' => ['unitId' => 15, 'ownerId' => 167], // Akuntansi & Perpajakan
        'DIMR' => ['unitId' => 16, 'ownerId' => 181], // Manajemen Risiko
    ];

    public function run(): void
    {
        $path = __DIR__ . '/data/programs_dkmr_2026.json';
        $rows = json_decode(file_get_contents($path), true);

        if (! is_array($rows) || $rows === []) {
            throw new \RuntimeException("Gagal parse {$path}: " . json_last_error_msg());
        }

        // Reset idempotent — cascade menyapu seluruh sub-tree program; entity_pics
        // (co-PIC) polimorfik tanpa FK ke Program, jadi dibersihkan manual.
        DB::table('Program')->delete();
        DB::table('entity_pics')->where('entityType', 'Program')->delete();

        // PDF tidak mencantumkan tanggal mulai; pakai awal tahun program RKAP 2026.
        $start = Carbon::create(2026, 1, 1)->startOfDay();
        $now = now();
        $count = 0;

        foreach ($rows as $r) {
            $div = $r['div'];
            $cfg = self::DIV[$div];
            $seq = str_pad((string) $r['no'], 3, '0', STR_PAD_LEFT);
            $suffix = "DKMR-{$div}-{$seq}";

            // Owner = PIC asli dari Excel (kolom L); fallback kepala divisi bila tak ter-resolve.
            $ownerId = $r['picId'] ?? $cfg['ownerId'];
            // Mitra Suksesor → co-PIC; buang null & yang sama dengan owner.
            $coPicIds = array_values(array_unique(array_filter(
                $r['mitraIds'] ?? [],
                fn ($id) => $id && $id !== $ownerId,
            )));

            [$pStatus, $health, $taskStatus, $pct] = $this->mapStatus($r['status']);
            $target = $this->parseDeadline($r['deadline']) ?? $start->copy()->endOfYear();

            $program = (new Program)->forceFill([
                'code'               => "PRG-{$suffix}",
                'name'               => $r['name'],
                'description'        => $this->blankToNull($r['output'] ?? null),
                'ownerId'            => $ownerId,
                'ownerUnitId'        => $cfg['unitId'],
                'status'             => $pStatus,
                'healthStatus'       => $health,
                'approvalStatus'     => 'ACTIVE',
                'priority'           => 'MEDIUM',
                'progressPercent'    => $pct,
                'kelompok'           => $r['kelompok'] === 'Scorecard' ? Kelompok::Scorecard : Kelompok::NonScorecard,
                'pilarStrategis'     => $this->mapPilar($r['pilar']),
                'progresTerkini'     => $this->blankToNull($r['progresTerkini'] ?? null),
                'dukunganDibutuhkan' => $this->blankToNull($r['dukungan'] ?? null),
                'startDate'          => $start,
                'targetEndDate'      => $target,
                'createdAt'          => $now,
                'updatedAt'          => $now,
            ]);
            $program->save();

            $workstream = (new Workstream)->forceFill([
                'code'             => "WS-{$suffix}",
                'programId'        => $program->id,
                'name'             => $r['name'],
                'description'      => $this->blankToNull($r['output'] ?? null),
                'ownerUnitId'      => $cfg['unitId'],
                'status'           => $taskStatus,
                'priority'         => 'MEDIUM',
                'progressPercent'  => $pct,
                'healthStatus'     => $health,
                'startDate'        => $start,
                'targetCompletion' => $target,
                'createdAt'        => $now,
                'updatedAt'        => $now,
            ]);
            $workstream->save();

            (new Task)->forceFill([
                'code'             => "WI-{$suffix}",
                'initiativeId'     => $workstream->id,
                'title'            => $this->blankToNull($r['output'] ?? null) ?? $r['name'],
                'description'      => $this->blankToNull($r['progresTerkini'] ?? null),
                'assignedTo'       => $ownerId,
                'createdBy'        => $ownerId,
                'createdByUnitId'  => $cfg['unitId'],
                'status'           => $taskStatus,
                'priority'         => 'MEDIUM',
                'percentComplete'  => $pct,
                'output'           => $this->blankToNull($r['output'] ?? null),
                'targetCompletion' => $target,
                'createdAt'        => $now,
                'updatedAt'        => $now,
            ])->save();

            // PIC + Mitra Suksesor → entity_pics (PIC = isPrimary).
            $picRows = [[
                'entityType' => 'Program', 'entityId' => $program->id,
                'userId' => $ownerId, 'isPrimary' => true, 'createdAt' => $now,
            ]];
            foreach ($coPicIds as $cid) {
                $picRows[] = [
                    'entityType' => 'Program', 'entityId' => $program->id,
                    'userId' => $cid, 'isPrimary' => false, 'createdAt' => $now,
                ];
            }
            DB::table('entity_pics')->insert($picRows);

            $count++;
        }

        $this->command?->info("Seeded {$count} program DKMR (+ workstream + task + PIC/co-PIC) dari Monitoring 22 Mei 2026.");
    }

    private function mapPilar(string $pilar): PilarStrategis
    {
        return match (trim($pilar)) {
            'Spending Better'      => PilarStrategis::SpendingBetter,
            'Collecting More'      => PilarStrategis::CollectingMore,
            'Innovative Financing' => PilarStrategis::InnovativeFinancing,
            default                => PilarStrategis::Enabler,
        };
    }

    /**
     * Status PDF → [Program.status, healthStatus, Task/Workstream.status, progressPercent].
     * healthStatus dibatasi GREEN/YELLOW/RED (FE normalizeHealthStatus mem-fallback
     * nilai lain ke YELLOW), jadi "Completed" = status COMPLETED + health GREEN.
     *
     * @return array{0:string,1:string,2:string,3:int}
     */
    private function mapStatus(string $status): array
    {
        return match (trim($status)) {
            'Completed' => ['COMPLETED', 'GREEN', 'COMPLETED', 100],
            'At Risk'   => ['IN_PROGRESS', 'YELLOW', 'IN_PROGRESS', 0],
            'Delayed'   => ['IN_PROGRESS', 'RED', 'IN_PROGRESS', 0],
            default     => ['IN_PROGRESS', 'GREEN', 'IN_PROGRESS', 0], // On Track
        };
    }

    /** Deadline PDF berformat M/D/YYYY (mis. 5/29/2026). */
    private function parseDeadline(?string $deadline): ?Carbon
    {
        if (! $deadline) {
            return null;
        }

        try {
            return Carbon::createFromFormat('n/j/Y', trim($deadline))->startOfDay();
        } catch (\Throwable) {
            return null;
        }
    }

    private function blankToNull(?string $value): ?string
    {
        $value = $value !== null ? trim($value) : null;

        return ($value === null || $value === '' || strtolower($value) === 'n.a') ? null : $value;
    }
}
