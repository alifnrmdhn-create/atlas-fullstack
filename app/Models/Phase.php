<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Catatan (2026-06-26): Phase TIDAK punya owner/PIC sendiri — dia struktur
 * timeline murni. PIC orang ada di Task.assignedTo (dipantau mingguan di
 * Workboard). Kolom `picUnitIds` & relasi entity_pics 'Phase' (0/223 terisi)
 * di-drop.
 */
class Phase extends Model
{
    protected $table = 'Phase';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';
    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    public function workstream()
    {
        return $this->belongsTo(Workstream::class, 'initiativeId');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class, 'phaseId');
    }
}
