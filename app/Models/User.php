<?php

namespace App\Models;

use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Auth\Access\Authorizable;

class User extends Model implements AuthenticatableContract
{
    use Authenticatable, Authorizable;

    protected $table = 'User';
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $guarded = ['id'];

    protected $hidden = [
        'passwordHash',
    ];

    protected $casts = [
        'isActive' => 'boolean',
        'preferences' => 'array',
        'createdAt' => 'datetime',
        'updatedAt' => 'datetime',
    ];

    /** Laravel Auth reads hash from here — kolom kita bernama passwordHash (bcrypt). */
    public function getAuthPassword()
    {
        return $this->passwordHash;
    }

    public function getAuthPasswordName()
    {
        return 'passwordHash';
    }

    /** Tidak ada kolom remember_token — disable fitur remember-me. */
    public function getRememberToken() { return null; }
    public function setRememberToken($value) { /* noop */ }
    public function getRememberTokenName() { return null; }

    // ── Relationships ────────────────────────────────────────────────
    public function unit()
    {
        return $this->belongsTo(OrganizationalUnit::class, 'unitId');
    }

    public function directorate()
    {
        return $this->belongsTo(Directorate::class, 'directorateId');
    }

    public function manager()
    {
        return $this->belongsTo(self::class, 'managerUserId');
    }

    public function position()
    {
        return $this->belongsTo(Position::class, 'positionId');
    }

    public function directReports()
    {
        return $this->hasMany(self::class, 'managerUserId');
    }
}
