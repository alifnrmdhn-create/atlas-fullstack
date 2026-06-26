<?php

namespace Tests\Feature;

use App\Models\EntityPic;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Mengunci pelonggaran otorisasi storeProgressLog (2026-06-24, arah "one-door
 * Workboard"): pelaporan kondisi periode (healthAtTime + PICA) kini boleh oleh
 * PIC utama (owner) DAN co-PIC (entity_pics), tidak lagi owner-only. Non-PIC
 * (sekalipun dalam scope organisasi) tetap ditolak — refleksi adalah
 * accountability statement tim PIC.
 */
class ConditionReportAuthTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    private function currentWeek(): string
    {
        return now()->format('o-\WW');
    }

    private function payload(): array
    {
        return [
            'period'       => $this->currentWeek(),
            'healthAtTime' => 'at_risk',
            'narrative'    => 'Posisi minggu ini: workshop selesai, dokumen 80%.',
            'kendala'      => 'Menunggu data baseline unit.',
        ];
    }

    private function makeProgram(User $owner): int
    {
        return (int) $this->actingAs($owner)->postJson('/programs', [
            'name'          => "Program {$owner->userId}",
            'priority'      => 'HIGH',
            'startDate'     => now()->toDateString(),
            'targetEndDate' => now()->addMonths(2)->toDateString(),
            'ownerId'       => $owner->id,
            'hasNoApmsKpi'  => true,
        ])->assertCreated()->json('data.id');
    }

    public function test_owner_can_report_condition(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner = $this->makeUser('owner-a', 'KASUBDIV', $unit->id, $dir->id);
        $id = $this->makeProgram($owner);

        $this->actingAs($owner)
            ->postJson("/programs/{$id}/progress-log", $this->payload())
            ->assertSuccessful();

        $this->assertDatabaseHas('ProgramProgressLog', [
            'programId'    => $id,
            'period'       => $this->currentWeek(),
            'healthAtTime' => 'at_risk',
        ]);
    }

    public function test_co_pic_can_report_condition(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner = $this->makeUser('owner-b', 'KASUBDIV', $unit->id, $dir->id);
        $coPic = $this->makeUser('copic-b', 'OFFICER', $unit->id, $dir->id);
        $id = $this->makeProgram($owner);

        // Co-PIC = baris entity_pics non-primary untuk program ini.
        EntityPic::create([
            'entityType' => 'Program',
            'entityId'   => $id,
            'userId'     => $coPic->id,
            'isPrimary'  => false,
        ]);

        $this->actingAs($coPic)
            ->postJson("/programs/{$id}/progress-log", $this->payload())
            ->assertSuccessful();
    }

    public function test_non_pic_cannot_report_condition(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner    = $this->makeUser('owner-c', 'KASUBDIV', $unit->id, $dir->id);
        $stranger = $this->makeUser('stranger-c', 'OFFICER', $unit->id, $dir->id);
        $id = $this->makeProgram($owner);

        $this->actingAs($stranger)
            ->postJson("/programs/{$id}/progress-log", $this->payload())
            ->assertStatus(403);

        $this->assertDatabaseMissing('ProgramProgressLog', ['programId' => $id]);
    }

    public function test_reflection_meta_exposes_can_report_flag(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner    = $this->makeUser('owner-d', 'KASUBDIV', $unit->id, $dir->id);
        // Officer di unit yang sama → scope-nya mencakup program (assertAccess
        // lolos) tapi BUKAN PIC → boleh BACA meta tapi canReport=false.
        $officer = $this->makeUser('officer-d', 'OFFICER', $unit->id, $dir->id);
        $id = $this->makeProgram($owner);

        $this->actingAs($owner)
            ->getJson("/programs/{$id}/reflection-meta")
            ->assertSuccessful()
            ->assertJsonPath('data.canReport', true);

        $this->actingAs($officer)
            ->getJson("/programs/{$id}/reflection-meta")
            ->assertSuccessful()
            ->assertJsonPath('data.canReport', false);
    }
}
