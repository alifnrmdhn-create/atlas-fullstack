<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\BlockerController;
use App\Http\Controllers\KpiController;
use App\Http\Controllers\PhaseController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ── Guest ─────────────────────────────────────────────────────────────────────
Route::middleware('guest')->group(function () {
    Route::get('/login', [AuthController::class, 'showLogin'])->name('login');
    Route::post('/login', [AuthController::class, 'login']);
});

// ── Authenticated ─────────────────────────────────────────────────────────────
Route::middleware('auth')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

    Route::get('/', fn () => Inertia::render('Dashboard'))->name('home');

    // ── Programs ─────────────────────────────────────────────────────────────
    Route::prefix('programs')->name('programs.')->group(function () {
        Route::get('/',              [ProgramController::class, 'index'])->name('index');
        Route::post('/',             [ProgramController::class, 'store'])->name('store');
        Route::get('/archived',      [ProgramController::class, 'archived'])->name('archived');
        Route::get('/timeline-all',  [ProgramController::class, 'timelineAll'])->name('timeline-all');
        Route::get('/execution-pulse',[ProgramController::class, 'executionPulse'])->name('execution-pulse');

        Route::get('/{id}',          [ProgramController::class, 'show'])->name('show');
        Route::put('/{id}',          [ProgramController::class, 'update'])->name('update');
        Route::delete('/{id}',       [ProgramController::class, 'destroy'])->name('destroy');

        // Approval workflow
        Route::post('/{id}/submit',   [ProgramController::class, 'submit'])->name('submit');
        Route::post('/{id}/activate', [ProgramController::class, 'activate'])->name('activate');
        Route::post('/{id}/approve',  [ProgramController::class, 'approve'])->name('approve');
        Route::post('/{id}/reject',   [ProgramController::class, 'reject'])->name('reject');
        Route::patch('/{id}/archive', [ProgramController::class, 'archive'])->name('archive');
        Route::patch('/{id}/restore', [ProgramController::class, 'restore'])->name('restore');

        // Sub-resources
        Route::get('/{id}/health',        [ProgramController::class, 'health'])->name('health');
        Route::get('/{id}/workstreams',   [ProgramController::class, 'workstreams'])->name('workstreams');
        Route::get('/{id}/kpi-links',     [ProgramController::class, 'kpiLinks'])->name('kpi-links.index');
        Route::post('/{id}/kpi-links',    [ProgramController::class, 'addKpiLink'])->name('kpi-links.store');
        Route::delete('/{id}/kpi-links/{code}', [ProgramController::class, 'removeKpiLink'])->name('kpi-links.destroy');
    });

    // ── Tasks ─────────────────────────────────────────────────────────────────
    Route::prefix('tasks')->name('tasks.')->group(function () {
        Route::post('/',             [TaskController::class, 'store'])->name('store');
        Route::get('/{id}',          [TaskController::class, 'show'])->name('show');
        Route::patch('/{id}',        [TaskController::class, 'update'])->name('update');
        Route::delete('/{id}',       [TaskController::class, 'destroy'])->name('destroy');
        Route::put('/{id}/status',   [TaskController::class, 'updateStatus'])->name('status');
        Route::put('/{id}/progress', [TaskController::class, 'updateProgress'])->name('progress');
        Route::put('/{id}/assign',   [TaskController::class, 'assign'])->name('assign');

        // SubTask
        Route::post('/{id}/subtasks',                    [TaskController::class, 'storeSubTask'])->name('subtasks.store');
        Route::delete('/{id}/subtasks/{subTaskId}',      [TaskController::class, 'destroySubTask'])->name('subtasks.destroy');
        Route::patch('/{id}/subtasks/{subTaskId}/toggle',[TaskController::class, 'toggleSubTask'])->name('subtasks.toggle');
    });

    // ── Phases ────────────────────────────────────────────────────────────────
    Route::prefix('phases')->name('phases.')->group(function () {
        Route::put('/{id}',    [PhaseController::class, 'update'])->name('update');
        Route::delete('/{id}', [PhaseController::class, 'destroy'])->name('destroy');
    });

    // ── Blockers ──────────────────────────────────────────────────────────────
    Route::prefix('blockers')->name('blockers.')->group(function () {
        Route::get('/',              [BlockerController::class, 'index'])->name('index');
        Route::post('/',             [BlockerController::class, 'store'])->name('store');
        Route::put('/{id}/status',   [BlockerController::class, 'updateStatus'])->name('status');
        Route::patch('/{id}',        [BlockerController::class, 'update'])->name('update');
        Route::delete('/{id}',       [BlockerController::class, 'destroy'])->name('destroy');
    });

    // ── KPIs ──────────────────────────────────────────────────────────────────
    Route::prefix('kpis')->name('kpis.')->group(function () {
        Route::get('/',          [KpiController::class, 'index'])->name('index');
        Route::post('/',         [KpiController::class, 'store'])->name('store');
        Route::get('/{id}',      [KpiController::class, 'show'])->name('show');
        Route::patch('/{id}',    [KpiController::class, 'update'])->name('update');
        Route::delete('/{id}',   [KpiController::class, 'destroy'])->name('destroy');
        Route::post('/{id}/values', [KpiController::class, 'storeValue'])->name('values.store');
    });
});
