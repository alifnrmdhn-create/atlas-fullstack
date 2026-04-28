<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rename DM channels from "DM:X:Y" (old format) to "dm-X-Y" (current format).
 * The frontend expects "dm-{a}-{b}" (lowercase, hyphen-separated) to identify
 * DM channels and parse partner IDs.
 */
return new class extends Migration
{
    public function up(): void
    {
        $channels = DB::table('Channel')
            ->where('type', 'PRIVATE')
            ->where('name', 'LIKE', 'DM:%')
            ->get(['id', 'name']);

        foreach ($channels as $channel) {
            // "DM:153:194" → "dm-153-194"
            $newName = 'dm-' . str_replace(':', '-', substr($channel->name, 3));
            $newCode = $newName;

            // Only update if the new name doesn't already exist
            $exists = DB::table('Channel')->where('name', $newName)->exists();
            if (!$exists) {
                DB::table('Channel')
                    ->where('id', $channel->id)
                    ->update(['name' => $newName, 'code' => $newCode]);
            }
        }
    }

    public function down(): void
    {
        // Not reversible — old format was inconsistent with the rest of the codebase
    }
};
