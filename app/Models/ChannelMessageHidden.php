<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChannelMessageHidden extends Model
{
    protected $table = 'ChannelMessageHidden';
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null;
    protected $guarded = [];

    protected $casts = ['hiddenAt' => 'datetime'];
}
