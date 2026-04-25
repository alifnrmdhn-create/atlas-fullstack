<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $column = DB::selectOne(
            "select data_type, udt_name
             from information_schema.columns
             where table_name = 'MonthlyReport'
               and column_name = 'linkedProgramIds'"
        );

        if (!$column || $column->data_type !== 'ARRAY') {
            return;
        }

        DB::statement('alter table "MonthlyReport" alter column "linkedProgramIds" drop default');
        DB::statement(
            'alter table "MonthlyReport"
             alter column "linkedProgramIds" type jsonb
             using to_jsonb(coalesce("linkedProgramIds", array[]::integer[]))'
        );
        DB::statement('alter table "MonthlyReport" alter column "linkedProgramIds" set default \'[]\'::jsonb');
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $column = DB::selectOne(
            "select data_type, udt_name
             from information_schema.columns
             where table_name = 'MonthlyReport'
               and column_name = 'linkedProgramIds'"
        );

        if (!$column || !in_array($column->udt_name, ['json', 'jsonb'], true)) {
            return;
        }

        DB::statement('alter table "MonthlyReport" alter column "linkedProgramIds" drop default');
        DB::statement(
            'alter table "MonthlyReport"
             alter column "linkedProgramIds" type integer[]
             using coalesce(
                array(select jsonb_array_elements_text("linkedProgramIds"::jsonb)::integer),
                array[]::integer[]
             )'
        );
        DB::statement('alter table "MonthlyReport" alter column "linkedProgramIds" set default array[]::integer[]');
    }
};
