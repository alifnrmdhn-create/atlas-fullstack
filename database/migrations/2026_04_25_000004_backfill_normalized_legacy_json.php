<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        if (Schema::hasTable('assignment_approval_entries')) {
            DB::table('Assignment')
                ->select('id', 'approvalChain')
                ->whereNotNull('approvalChain')
                ->orderBy('id')
                ->get()
                ->each(function ($assignment) use ($now) {
                    $exists = DB::table('assignment_approval_entries')
                        ->where('assignmentId', $assignment->id)
                        ->exists();

                    if ($exists) return;

                    foreach ($this->decodeJsonArray($assignment->approvalChain) as $item) {
                        if (!is_array($item) || empty($item['userId'])) continue;

                        DB::table('assignment_approval_entries')->insert([
                            'assignmentId' => $assignment->id,
                            'userId' => (int) $item['userId'],
                            'role' => (string) ($item['role'] ?? ''),
                            'name' => (string) ($item['name'] ?? ''),
                            'positionTitle' => $item['positionTitle'] ?? null,
                            'order' => (int) ($item['order'] ?? 0),
                            'status' => (string) ($item['status'] ?? 'PENDING'),
                            'actedAt' => $item['actedAt'] ?? null,
                            'note' => $item['note'] ?? null,
                            'createdAt' => $now,
                            'updatedAt' => $now,
                        ]);
                    }
                });
        }

        if (Schema::hasTable('entity_pics')) {
            $validUserIds = DB::table('User')
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->flip();

            foreach ([
                'Program' => 'Program',
                'Initiative' => 'Initiative',
                'Phase' => 'Phase',
                'WorkItem' => 'WorkItem',
            ] as $table => $entityType) {
                if (!Schema::hasTable($table) || !Schema::hasColumn($table, 'picPersonIds')) continue;

                DB::table($table)
                    ->select('id', 'picPersonIds')
                    ->whereNotNull('picPersonIds')
                    ->orderBy('id')
                    ->get()
                    ->each(function ($row) use ($entityType, $validUserIds, $now) {
                        $userIds = collect($this->decodeJsonArray($row->picPersonIds))
                            ->map(fn ($id) => (int) $id)
                            ->filter(fn ($id) => $id > 0 && $validUserIds->has($id))
                            ->unique()
                            ->values();

                        foreach ($userIds as $index => $userId) {
                            DB::table('entity_pics')->updateOrInsert(
                                [
                                    'entityType' => $entityType,
                                    'entityId' => $row->id,
                                    'userId' => $userId,
                                ],
                                [
                                    'isPrimary' => $index === 0,
                                    'createdAt' => $now,
                                ],
                            );
                        }
                    });
            }
        }
    }

    public function down(): void
    {
        // Backfill is intentionally not reversed; normalized rows may be
        // updated independently after this migration runs.
    }

    /** @return array<int, mixed> */
    private function decodeJsonArray(mixed $value): array
    {
        if (is_array($value)) return $value;
        if (!is_string($value) || trim($value) === '') return [];

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }
};
