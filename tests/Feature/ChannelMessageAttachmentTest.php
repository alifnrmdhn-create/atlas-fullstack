<?php

namespace Tests\Feature;

use App\Models\Directorate;
use App\Models\OrganizationalUnit;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Mengunci perbaikan upload lampiran di Channels (bug 2026-06-25): pesan
 * attachment-only (tanpa teks) dulu ditolak "The content field is required."
 * karena rule `content => required` + middleware global TrimStrings /
 * ConvertEmptyStringsToNull menjadikan content " "/"" → NULL sebelum validator.
 *
 * Kontrak baru ChannelMessageController::store:
 *   - content NULLABLE; pesan valid bila punya teks ATAU lampiran.
 *   - lampiran-saja → tersimpan (content = ''), broadcast tetap jalan.
 *   - teks " " (spasi) + lampiran → lolos (jangan jatuh ke "content required").
 *   - tanpa teks DAN tanpa lampiran → tetap ditolak.
 */
class ChannelMessageAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private User $me;
    private int $channelId;

    protected function setUp(): void
    {
        parent::setUp();

        $dir = Directorate::create(['code' => 'DIR-T', 'name' => 'Direktorat T', 'description' => null]);
        $unit = OrganizationalUnit::create([
            'code' => 'DIV-T', 'name' => 'Divisi T', 'unitType' => 'DIVISI',
            'directorateId' => $dir->id, 'parentId' => null,
        ]);

        $this->me = User::create([
            'name' => 'me-user', 'email' => 'me@ptpn.test', 'userId' => 'me-user',
            'passwordHash' => Hash::make('password'), 'roleType' => 'KASUBDIV',
            'isActive' => true, 'unitId' => $unit->id, 'directorateId' => $dir->id,
        ]);

        $this->channelId = (int) DB::table('Channel')->insertGetId([
            'code' => 'CH-T', 'name' => 'ch-test', 'type' => 'PUBLIC',
            'createdBy' => $this->me->id, 'isArchived' => false,
            'createdAt' => now(), 'updatedAt' => now(),
        ]);
        DB::table('ChannelMember')->insert([
            'channelId' => $this->channelId, 'userId' => $this->me->id,
            'joinedAt' => now(), 'lastViewedAt' => now(),
        ]);
    }

    private function send(array $payload)
    {
        return $this->actingAs($this->me)
            ->postJson("/channels/{$this->channelId}/messages", $payload);
    }

    private function attachment(): array
    {
        return [
            'url' => '/storage/uploads/kinerja-mei-2026.pdf',
            'name' => 'Kinerja Mei 2026.pdf',
            'type' => 'application/pdf',
            'size' => 113664,
        ];
    }

    public function test_attachment_only_message_is_accepted(): void
    {
        // Tanpa key 'content' sama sekali — meniru pesan lampiran-saja.
        $res = $this->send(['attachments' => [$this->attachment()]])->assertCreated();

        $id = $res->json('data.id');
        $row = DB::table('ChannelMessage')->where('id', $id)->first();

        $this->assertSame('', $row->content, 'content lampiran-saja tersimpan sbg string kosong.');
        $stored = json_decode($row->attachments, true);
        $this->assertCount(1, $stored);
        $this->assertSame('Kinerja Mei 2026.pdf', $stored[0]['name']);
    }

    public function test_whitespace_content_with_attachment_is_accepted(): void
    {
        // " " akan di-trim middleware → "" → NULL. Dulu memicu "content required".
        $this->send(['content' => ' ', 'attachments' => [$this->attachment()]])
            ->assertCreated();
    }

    public function test_text_only_message_still_works(): void
    {
        $res = $this->send(['content' => 'halo tanpa lampiran'])->assertCreated();
        $row = DB::table('ChannelMessage')->where('id', $res->json('data.id'))->first();
        $this->assertSame('halo tanpa lampiran', $row->content);
    }

    public function test_empty_message_without_attachment_is_rejected(): void
    {
        $this->send(['content' => '   '])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['content']);

        $this->send([])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['content']);
    }

    public function test_malformed_attachment_is_rejected(): void
    {
        // Lampiran tanpa url/name/type → ditolak (shape validation).
        $this->send(['attachments' => [['size' => 10]]])
            ->assertStatus(422);
    }
}
