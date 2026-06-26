<?php

namespace Tests\Feature\Meeting;

use App\Models\Directorate;
use App\Models\Meeting;
use App\Models\MeetingAttendee;
use App\Models\Notification;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Delegasi RSVP harus: (1) menjadikan delegate sebagai attendee — sebelumnya
 * tidak, sehingga delegate tak bisa membuka rapat (assertAccess 403) maupun
 * melihatnya di jadwal; dan (2) memberi tahu delegate (pasangan Notification +
 * broadcast), yang sebelumnya hilang total.
 */
class MeetingRsvpDelegationTest extends TestCase
{
    use RefreshDatabase;

    private User $organizer;
    private User $attendee;
    private User $delegate;
    private Meeting $meeting;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-DG', 'name' => 'Direktorat DG']);
        $unit = OrganizationalUnit::create([
            'code' => 'UNIT-DG', 'name' => 'Unit DG',
            'unitType' => 'DIVISI', 'directorateId' => $dir->id,
        ]);

        $mk = fn (string $slug, string $role) => User::create([
            'name' => ucfirst($slug) . ' DG', 'email' => "{$slug}-dg@ptpn.test",
            'userId' => "{$slug}-dg", 'passwordHash' => Hash::make('password-123'),
            'roleType' => $role, 'isActive' => true,
            'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);

        $this->organizer = $mk('org', 'KADIV');
        $this->attendee  = $mk('att', 'ASISTEN');
        $this->delegate  = $mk('del', 'ASISTEN');

        $this->meeting = Meeting::create([
            'title' => 'Rapat Delegasi DG',
            'organizerId' => $this->organizer->id,
            'status' => 'SCHEDULED',
            'startAt' => now()->addDay(),
            'endAt' => now()->addDay()->addHour(),
            'meetingType' => 'RAPAT_KOORDINASI',
        ]);

        MeetingAttendee::create([
            'meetingId' => $this->meeting->id,
            'userId' => $this->attendee->id,
            'attendeeRole' => 'REQUIRED',
            'rsvpStatus' => 'PENDING',
        ]);
    }

    public function test_delegation_adds_delegate_as_attendee_and_notifies(): void
    {
        $this->assertDatabaseMissing('MeetingAttendee', [
            'meetingId' => $this->meeting->id,
            'userId' => $this->delegate->id,
        ]);

        $this->actingAs($this->attendee)
            ->postJson("/meetings/{$this->meeting->id}/rsvp", [
                'rsvpStatus' => 'DELEGASI',
                'delegateToId' => $this->delegate->id,
                'delegateNote' => 'Tolong wakili saya.',
            ])
            ->assertOk();

        // Delegating attendee recorded as DELEGASI.
        $this->assertDatabaseHas('MeetingAttendee', [
            'meetingId' => $this->meeting->id,
            'userId' => $this->attendee->id,
            'rsvpStatus' => 'DELEGASI',
            'delegateToId' => $this->delegate->id,
        ]);

        // Delegate is now an attendee — can open the meeting & see it in schedule.
        $this->assertDatabaseHas('MeetingAttendee', [
            'meetingId' => $this->meeting->id,
            'userId' => $this->delegate->id,
            'rsvpStatus' => 'PENDING',
        ]);

        // Delegate notified.
        $this->assertDatabaseHas('Notification', [
            'userId' => $this->delegate->id,
            'type' => 'MEETING_DELEGATED',
            'source' => "meeting:{$this->meeting->id}",
        ]);
    }

    public function test_delegation_preserves_existing_attendee_rsvp(): void
    {
        // Delegate already an attendee who accepted — delegation must NOT reset them.
        MeetingAttendee::create([
            'meetingId' => $this->meeting->id,
            'userId' => $this->delegate->id,
            'attendeeRole' => 'REQUIRED',
            'rsvpStatus' => 'HADIR',
        ]);

        $this->actingAs($this->attendee)
            ->postJson("/meetings/{$this->meeting->id}/rsvp", [
                'rsvpStatus' => 'DELEGASI',
                'delegateToId' => $this->delegate->id,
            ])
            ->assertOk();

        $this->assertDatabaseHas('MeetingAttendee', [
            'meetingId' => $this->meeting->id,
            'userId' => $this->delegate->id,
            'rsvpStatus' => 'HADIR',
        ]);
    }
}
