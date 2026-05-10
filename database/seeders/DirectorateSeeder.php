<?php

namespace Database\Seeders;

class DirectorateSeeder extends JsonSeeder
{
    protected function tableName(): string
    {
        return 'Directorate';
    }

    protected function jsonFile(): string
    {
        return 'directorates.json';
    }
}
