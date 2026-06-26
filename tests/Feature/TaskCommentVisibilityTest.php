<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsOrgFixtures;
use Tests\TestCase;

/**
 * Regresi (2026-06-24): TaskController::show() meng-hardcode `comments => []`,
 * sehingga komentar Discussion yang sudah tersimpan via POST /tasks/{id}/comments
 * tak pernah muncul lagi setelah reload ("ketik → Send → hilang"). Test ini
 * mengunci bahwa show() mengembalikan komentar asli dengan bentuk CommentItem
 * (authorName/authorRole) yang dipakai CommentThreadList.
 */
class TaskCommentVisibilityTest extends TestCase
{
    use RefreshDatabase;
    use BuildsOrgFixtures;

    public function test_task_show_returns_posted_comments(): void
    {
        [$dir, $unit] = $this->makeDirectorate('DIR-A', 'DIV-A');
        $owner = $this->makeUser('owner-cmt', 'KASUBDIV', $unit->id, $dir->id);
        $stack = $this->seedProgramStack($owner, 'CMT');
        $taskId = $stack['task'];

        // Sebelum fix: show selalu [] walau POST sukses.
        $this->actingAs($owner)
            ->postJson("/tasks/{$taskId}/comments", ['commentText' => 'Catatan eksekusi minggu ini'])
            ->assertSuccessful();

        $res = $this->actingAs($owner)
            ->getJson("/tasks/{$taskId}")
            ->assertSuccessful();

        $res->assertJsonPath('data.comments.0.commentText', 'Catatan eksekusi minggu ini');
        $res->assertJsonPath('data.comments.0.authorName', $owner->name);
        // authorRole = positionTitle (fallback roleType) — non-null supaya
        // CommentThreadList tidak menampilkan "Contributor" generik.
        $this->assertNotNull($res->json('data.comments.0.authorRole'));
        // reactions WAJIB non-null (objek) — kolom nullable bikin CommentThreadList
        // crash baca reactions[':thumbsup:'] saat null. replyCount integer.
        $this->assertNotNull($res->json('data.comments.0.reactions'));
        $this->assertSame(0, $res->json('data.comments.0.replyCount'));
    }
}
