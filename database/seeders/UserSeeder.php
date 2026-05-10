<?php

namespace Database\Seeders;

class UserSeeder extends JsonSeeder
{
    protected function tableName(): string
    {
        return 'User';
    }

    protected function jsonFile(): string
    {
        return 'users.json';
    }

    protected function selfReferenceColumns(): array
    {
        return ['managerUserId'];
    }
}
