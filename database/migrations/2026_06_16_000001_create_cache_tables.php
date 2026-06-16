<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tabel cache + cache_locks (scale-readiness S1.3).
 *
 * Memungkinkan CACHE_STORE=database — cache shared antar-replica via Postgres
 * (gratis, tanpa Redis). Wajib untuk korektnes multi-replica: cache scope/
 * membership/settings yang sebelumnya di file-cache per-container jadi tidak
 * konsisten antar-replica (keputusan authz bisa beda). `cache_locks`
 * mengaktifkan lock atomik lintas-replica → `onOneServer()` scheduler &
 * `Cache::add()` throttle presence jadi benar di N-replica.
 *
 * Skema standar Laravel (php artisan cache:table).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cache')) {
            Schema::create('cache', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->mediumText('value');
                $table->integer('expiration');
            });
        }

        if (! Schema::hasTable('cache_locks')) {
            Schema::create('cache_locks', function (Blueprint $table) {
                $table->string('key')->primary();
                $table->string('owner');
                $table->integer('expiration');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cache');
        Schema::dropIfExists('cache_locks');
    }
};
