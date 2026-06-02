<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Link the onboarding guide channel (panduan-channels) to the BCMS program so
 * its context banner renders. The original 2026_05_10 seed hardcoded program
 * id 23, which no longer exists after the 97-program PDF reseed (2026-05-29/30)
 * — BCMS now has a different id. Resolve it by name so this works regardless of
 * id across local/prod, and only (re)link when the current target is missing or
 * dangling (idempotent: leaves a valid existing link untouched).
 */
return new class extends Migration
{
    public function up(): void
    {
        $channel = DB::table('Channel')
            ->where('code', 'panduan-channels')
            ->first(['id', 'linkedProgramId']);

        if (! $channel) {
            return; // no guide channel in this environment
        }

        // Already pointing at a real program? leave it as-is.
        if ($channel->linkedProgramId !== null
            && DB::table('Program')->where('id', $channel->linkedProgramId)->exists()) {
            return;
        }

        $program = DB::table('Program')
            ->where('name', 'like', '%BCMS%')
            ->orderBy('id')
            ->first(['id']);

        if (! $program) {
            return; // BCMS program not present (e.g. migrate before seeding)
        }

        DB::table('Channel')
            ->where('id', $channel->id)
            ->update(['linkedProgramId' => $program->id]);
    }

    public function down(): void
    {
        // Best-effort revert: only unset if it still points at a BCMS program.
        $program = DB::table('Program')
            ->where('name', 'like', '%BCMS%')
            ->orderBy('id')
            ->first(['id']);

        if ($program) {
            DB::table('Channel')
                ->where('code', 'panduan-channels')
                ->where('linkedProgramId', $program->id)
                ->update(['linkedProgramId' => null]);
        }
    }
};
