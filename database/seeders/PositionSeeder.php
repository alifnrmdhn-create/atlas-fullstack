<?php

namespace Database\Seeders;

class PositionSeeder extends JsonSeeder
{
    protected function tableName(): string
    {
        return 'Position';
    }

    protected function jsonFile(): string
    {
        return 'positions.json';
    }

    protected function selfReferenceColumns(): array
    {
        return ['reportsToPositionId'];
    }
}
