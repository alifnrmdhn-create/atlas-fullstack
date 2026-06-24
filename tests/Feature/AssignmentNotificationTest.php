<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\Notification;
use App\Models\OrganizationalUnit;
use App\Models\User;
use App\Services\AssignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci tipe notifikasi transisi Assignment (audit notif 2026-06-24).
 *
 * Dulu CANCEL & REOPEN tidak menotifikasi PIC sama sekali, dan notifikasi
 * assignment lama ter-seed sebagai TASK_ASSIGNED generik (label "Assigned"
 * menyesatkan untuk pembatalan). Kini tiap kejadian punya tipe sendiri.
 */
class AssignmentNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $kadiv;
    private User $officer;
    private AssignmentService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(AssignmentService::class);

        $dir = Directorate::create(['code' => 'DIR', 'name' => 'Dir', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT', 'name' => 'Unit', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);
        $this->kadiv = $this->makeUser('kadiv@ptpn.test', 'KADIV', $unit->id);
        $this->officer = $this->makeUser('officer@ptpn.test', 'OFFICER', $unit->id, $this->kadiv->id);
    }

    private function makeUser(string $email, string $role, int $unitId, ?int $managerId = null): User
    {
        return User::create([
            'name' => $email, 'email' => $email, 'userId' => $email,
            'passwordHash' => Hash::make('password'), 'roleType' => $role,
            'isActive' => true, 'unitId' => $unitId,
            'directorateId' => Directorate::first()->id, 'managerUserId' => $managerId,
        ]);
    }

    private function createAssignment(): int
    {
        return $this->svc->create($this->kadiv, [
            'title' => 'Penugasan Test',
            'assigneeId' => $this->officer->id,
            'priority' => 'MEDIUM',
            'dueDate' => now()->addWeek()->toDateString(),
        ])->id;
    }

    public function test_cancel_notifies_assignee_with_cancelled_type(): void
    {
        $id = $this->createAssignment();

        $this->actingAs($this->kadiv)
            ->postJson("/assignments/{$id}/transition", ['action' => 'CANCEL', 'note' => 'tidak jadi'])
            ->assertOk();

        $this->assertDatabaseHas('Notification', [
            'userId' => $this->officer->id,
            'type' => 'ASSIGNMENT_CANCELLED',
            'source' => "assignment:{$id}",
        ]);
        // Tidak salah ketik sebagai TASK_ASSIGNED.
        $this->assertDatabaseMissing('Notification', [
            'source' => "assignment:{$id}",
            'type' => 'TASK_ASSIGNED',
        ]);
    }

    public function test_reopen_notifies_assignee_with_reopened_type(): void
    {
        $id = $this->createAssignment();
        $this->actingAs($this->kadiv)->postJson("/assignments/{$id}/transition", ['action' => 'CANCEL'])->assertOk();
        $this->actingAs($this->kadiv)->postJson("/assignments/{$id}/transition", ['action' => 'REOPEN'])->assertOk();

        $this->assertDatabaseHas('Notification', [
            'userId' => $this->officer->id,
            'type' => 'ASSIGNMENT_REOPENED',
            'source' => "assignment:{$id}",
        ]);
    }
}
