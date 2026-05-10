<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Base seeder yang load data dari JSON file di `database/seeders/data/`.
 *
 * Pattern: idempotent (skip kalau tabel sudah ada data) + 2-pass insert untuk
 * kolom self-referencing (mis. User.managerUserId, OrgUnit.parentId,
 * Position.reportsToPositionId).
 *
 * Subclass wajib override `tableName()` & `jsonFile()`. Override
 * `selfReferenceColumns()` kalau tabel punya FK ke dirinya sendiri.
 */
abstract class JsonSeeder extends Seeder
{
    abstract protected function tableName(): string;

    abstract protected function jsonFile(): string;

    /**
     * Kolom yang akan di-NULL pada pass 1 dan di-update pada pass 2.
     */
    protected function selfReferenceColumns(): array
    {
        return [];
    }

    public function run(): void
    {
        $table = $this->tableName();

        if (DB::table($table)->exists()) {
            return;
        }

        $path = __DIR__ . '/data/' . $this->jsonFile();
        $rows = json_decode(file_get_contents($path), true);

        if (!is_array($rows)) {
            throw new \RuntimeException("Gagal parse JSON {$path}: " . json_last_error_msg());
        }

        $selfRefs = $this->selfReferenceColumns();
        $deferred = [];

        foreach ($rows as &$row) {
            foreach ($selfRefs as $col) {
                if (array_key_exists($col, $row) && $row[$col] !== null) {
                    $deferred[$row['id']][$col] = $row[$col];
                    $row[$col] = null;
                }
            }
            foreach ($row as $col => $val) {
                if (is_array($val) || is_object($val)) {
                    $row[$col] = json_encode($val);
                }
            }
        }
        unset($row);

        DB::table($table)->insert($rows);

        foreach ($deferred as $id => $updates) {
            DB::table($table)->where('id', $id)->update($updates);
        }

        DB::statement(sprintf(
            'SELECT setval(pg_get_serial_sequence(\'"%s"\', \'id\'), (SELECT MAX(id) FROM "%s"))',
            $table,
            $table,
        ));
    }
}
