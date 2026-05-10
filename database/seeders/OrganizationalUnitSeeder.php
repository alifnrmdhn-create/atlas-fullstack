<?php

namespace Database\Seeders;

class OrganizationalUnitSeeder extends JsonSeeder
{
    protected function tableName(): string
    {
        return 'OrganizationalUnit';
    }

    protected function jsonFile(): string
    {
        return 'organizational_units.json';
    }

    protected function selfReferenceColumns(): array
    {
        return ['parentId'];
    }
}
