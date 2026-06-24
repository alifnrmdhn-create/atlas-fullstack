<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $table = 'Notification';
    public $timestamps = false;
    protected $guarded = ['id'];

    protected $casts = [
        'createdAt' => 'datetime',
        'readAt' => 'datetime',
        'dismissedAt' => 'datetime',
        'resolvedAt' => 'datetime',
        'expiresAt' => 'datetime',
    ];

    /**
     * Tipe yang TIDAK di-supersede: tiap kejadian punya konten unik & berdiri
     * sendiri (chat & komentar). Selain ini, notifikasi bersifat "state entitas"
     * — hanya yang terbaru relevan, jadi yang lama auto-READ saat ada yang baru.
     */
    private const SUPERSEDE_EXEMPT_TYPES = ['MENTION', 'DM_RECEIVED', 'COMMENT'];

    protected static function booted(): void
    {
        // Supersede: notifikasi baru untuk entitas yang sama (userId+type+source)
        // menandai UNREAD lama jadi READ. Mencegah tumpukan transisi basi —
        // mis. assign→cancel→reopen pada 1 assignment yang dulu numpuk 5 UNREAD,
        // padahal hanya keadaan terkini yang relevan. Lihat audit notif 2026-06-24.
        static::created(function (Notification $n): void {
            if (in_array($n->type, self::SUPERSEDE_EXEMPT_TYPES, true)) {
                return;
            }
            if (empty($n->source)) {
                return;
            }

            static::query()
                ->where('id', '<>', $n->id)
                ->where('userId', $n->userId)
                ->where('type', $n->type)
                ->where('source', $n->source)
                ->where('state', 'UNREAD')
                ->update(['state' => 'READ', 'readAt' => now()]);
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'userId');
    }
}
