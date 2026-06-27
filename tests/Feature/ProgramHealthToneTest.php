<?php

namespace Tests\Feature;

use App\Models\Program;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci perbaikan "Home 18 terlambat, Programs 3" (2026-06-27).
 *
 * Akar bug: dua definisi "terlambat". Home (OrgSummaryService) menghitung
 * overdue-by-date ∪ health RED; Programs page hanya membaca healthStatus mentah
 * (RED). Perbaikan: SATU sumber kebenaran Program::classifyHealthTone, dipakai
 * kedua jalur, dan payload list program menyertakan `healthTone`.
 *
 * Test ini menjamin: program ACTIVE yang lewat targetEndDate tapi health GREEN
 * tetap diklasifikasi 'overdue' (bukan 'on_track'), dan tone itu ikut di payload
 * /programs sehingga FE bisa memfilter "Terlambat" dari sumber yang sama.
 */
class ProgramHealthToneTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_classify_health_tone_unifies_overdue_and_red(): void
    {
        $now = now();

        // Lewat tenggat + health GREEN → tetap 'overdue' (inilah ~15 program yang
        // dulu hilang dari filter Programs).
        $this->assertSame('overdue', Program::classifyHealthTone(
            'IN_PROGRESS', 'ACTIVE', $now->copy()->subDay(), 'GREEN', $now,
        ));

        // Belum lewat tenggat + health RED → 'terlambat'.
        $this->assertSame('terlambat', Program::classifyHealthTone(
            'IN_PROGRESS', 'ACTIVE', $now->copy()->addMonth(), 'RED', $now,
        ));

        // Sehat & on schedule → 'on_track'.
        $this->assertSame('on_track', Program::classifyHealthTone(
            'IN_PROGRESS', 'ACTIVE', $now->copy()->addMonth(), 'GREEN', $now,
        ));

        // Selesai menang di atas semua sinyal lain.
        $this->assertSame('selesai', Program::classifyHealthTone(
            'COMPLETED', 'ACTIVE', $now->copy()->subDay(), 'RED', $now,
        ));

        // Belum eksekusi (DRAFT/PENDING) → 'draft', tak dicampur health operasional.
        $this->assertSame('draft', Program::classifyHealthTone(
            'PLANNING', 'DRAFT', $now->copy()->subDay(), 'RED', $now,
        ));
    }

    public function test_program_list_payload_includes_health_tone_for_overdue_program(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-T', 'DIV-T');
        $admin = $this->makeUser('admin-t', 'SUPERADMIN', $unit->id, $dir->id);

        $programId = (int) $this->actingAs($admin)->postJson('/programs', [
            'code' => 'PRG-OVERDUE',
            'name' => 'Program Overdue',
            'startDate' => now()->subMonths(2)->toDateString(),
            'targetEndDate' => now()->subDays(5)->toDateString(),
            'ownerId' => $admin->id,
            'hasNoApmsKpi' => true,
        ])->assertCreated()->json('data.id');

        // Paksa kondisi yang dulu menipu: ACTIVE + health GREEN + sudah lewat tenggat.
        Program::query()->where('id', $programId)->update([
            'approvalStatus' => 'ACTIVE',
            'healthStatus'   => 'GREEN',
        ]);

        $payload = $this->actingAs($admin)->getJson('/programs')->assertOk()->json('data');
        $row = collect($payload)->firstWhere('id', $programId);

        $this->assertNotNull($row, 'Program overdue harus ada di payload list.');
        $this->assertSame('overdue', $row['healthTone'],
            'Program lewat tenggat (walau health GREEN) harus bertone overdue agar masuk filter Terlambat.');
    }
}
