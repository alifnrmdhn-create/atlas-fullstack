<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Mengunci index kolom filter terpanas (scale-readiness S3.2). Regresi:
 * seseorang drop index → query list/overview balik seq-scan di tabel besar.
 */
class ScaleHotIndexTest extends TestCase
{
    use RefreshDatabase;

    public function test_hot_filter_indexes_exist(): void
    {
        $expected = [
            'Program' => ['Program_ownerUnitId_approvalStatus_idx', 'Program_approvalStatus_idx', 'Program_active_partial_idx'],
            'ChannelMember' => ['ChannelMember_userId_idx'],
        ];

        foreach ($expected as $table => $indexes) {
            $present = collect(DB::select(
                'SELECT indexname FROM pg_indexes WHERE tablename = ?',
                [$table],
            ))->pluck('indexname')->all();

            foreach ($indexes as $idx) {
                $this->assertContains($idx, $present, "Index [{$idx}] pada {$table} hilang (scale-readiness S3.2).");
            }
        }
    }
}
