<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EntityPic extends Model
{
    protected $table = 'entity_pics';
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'isPrimary' => 'boolean',
        'createdAt' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }

    public function scopeForEntity($query, string $entityType, int $entityId)
    {
        return $query->where('entityType', $entityType)->where('entityId', $entityId);
    }

    /**
     * Replace semua pic untuk satu entitas dengan daftar userId baru.
     * Dipakai oleh Initiative, Phase, WorkItem (dan Program via ProgramService).
     *
     * @param array<int, int|string> $userIds
     */
    public static function syncForEntity(string $entityType, int $entityId, array $userIds): void
    {
        static::query()
            ->where('entityType', $entityType)
            ->where('entityId', $entityId)
            ->delete();

        $nextIds = collect($userIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        foreach ($nextIds as $index => $userId) {
            static::create([
                'entityType' => $entityType,
                'entityId'   => $entityId,
                'userId'     => (int) $userId,
                'isPrimary'  => $index === 0,
            ]);
        }
    }
}
