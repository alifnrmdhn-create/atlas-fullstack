<?php

namespace Tests\Feature\Meeting;

use App\Models\Directorate;
use App\Models\Meeting;
use App\Models\MeetingDecision;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Regresi: write-path keputusan rapat (add/delete) dulu TANPA cek otorisasi —
 * FE menyembunyikan tombol di balik `isOrganizer`, tapi BE menerima request
 * dari siapa pun. Akibatnya user mana pun bisa menyuntik/menghapus keputusan
 * (catatan governance/audit) di rapat milik orang/divisi lain.
 */
class MeetingDecisionAuthzTest extends TestCase
{
    use RefreshDatabase;

    private User $organizer;
    private User $outsider;
    private Meeting $meeting;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-DA', 'name' => 'Direktorat DA']);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-DA', 'name' => 'Unit DA',
            'unitType' => 'DIVISI', 'directorateId' => $dir->id,
        ]);

        $this->organizer = User::create([
            'name' => 'Organizer DA', 'email' => 'org-da@ptpn.test',
            'userId' => 'org-da', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'KADIV', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);
        $this->outsider = User::create([
            'name' => 'Outsider DA', 'email' => 'out-da@ptpn.test',
            'userId' => 'out-da', 'passwordHash' => Hash::make('password-123'),
            'roleType' => 'ASISTEN', 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);

        $this->meeting = Meeting::create([
            'title' => 'Rapat Keputusan DA',
            'organizerId' => $this->organizer->id,
            'status' => 'SCHEDULED',
            'startAt' => now()->addDay(),
            'endAt' => now()->addDay()->addHour(),
            'meetingType' => 'RAPAT_KOORDINASI',
        ]);
    }

    private function url(): string
    {
        return "/meetings/{$this->meeting->id}/decisions";
    }

    public function test_non_organizer_cannot_add_decision(): void
    {
        $this->actingAs($this->outsider)
            ->postJson($this->url(), ['decision' => 'Keputusan selundupan'])
            ->assertForbidden();

        $this->assertDatabaseCount('MeetingDecision', 0);
    }

    public function test_organizer_can_add_decision(): void
    {
        $this->actingAs($this->organizer)
            ->postJson($this->url(), ['decision' => 'Setujui anggaran Q3'])
            ->assertCreated();

        $this->assertDatabaseCount('MeetingDecision', 1);
    }

    public function test_non_organizer_cannot_delete_decision(): void
    {
        $decision = MeetingDecision::create([
            'meetingId' => $this->meeting->id,
            'decision' => 'Keputusan sah organizer',
            'decidedBy' => $this->organizer->id,
        ]);

        $this->actingAs($this->outsider)
            ->deleteJson("{$this->url()}/{$decision->id}")
            ->assertForbidden();

        $this->assertDatabaseCount('MeetingDecision', 1);
    }
}
