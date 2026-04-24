<?php

use App\Http\Controllers\AssignmentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\BlockerController;
use App\Http\Controllers\ChannelController;
use App\Http\Controllers\ChannelMessageController;
use App\Http\Controllers\CommentController;
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

    // ── Assignments (Penugasan) ───────────────────────────────────────────────
    Route::prefix('assignments')->name('assignments.')->group(function () {
        Route::get('/',                 [AssignmentController::class, 'index'])->name('index');
        Route::post('/',                [AssignmentController::class, 'store'])->name('store');
        Route::get('/preview-chain',    [AssignmentController::class, 'previewChain'])->name('preview-chain');
        Route::get('/{id}',             [AssignmentController::class, 'show'])->name('show');
        Route::patch('/{id}',           [AssignmentController::class, 'update'])->name('update');
        Route::delete('/{id}',          [AssignmentController::class, 'destroy'])->name('destroy');
        Route::post('/{id}/transition', [AssignmentController::class, 'transition'])->name('transition');

        // Evidence
        Route::get('/{id}/attachments',            [AssignmentController::class, 'listAttachments'])->name('attachments.index');
        Route::post('/{id}/attachments/file',      [AssignmentController::class, 'uploadFile'])->name('attachments.upload');
        Route::post('/{id}/attachments',           [AssignmentController::class, 'addLinkOrNote'])->name('attachments.store');
        Route::get('/{id}/attachments/{attId}/download', [AssignmentController::class, 'downloadAttachment'])->name('attachments.download');
        Route::delete('/{id}/attachments/{attId}', [AssignmentController::class, 'destroyAttachment'])->name('attachments.destroy');
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

    // ── Channels ──────────────────────────────────────────────────────────────
    Route::prefix('channels')->name('channels.')->group(function () {
        Route::get('/',          [ChannelController::class, 'index'])->name('index');
        Route::post('/',         [ChannelController::class, 'store'])->name('store');
        Route::get('/browse',    [ChannelController::class, 'browse'])->name('browse');
        Route::put('/read-all',  [ChannelController::class, 'markAllRead'])->name('read-all');
        Route::get('/{id}',      [ChannelController::class, 'show'])->name('show');
        Route::put('/{id}',      [ChannelController::class, 'update'])->name('update');
        Route::delete('/{id}',   [ChannelController::class, 'destroy'])->name('destroy');

        // Members
        Route::post('/{id}/members',           [ChannelController::class, 'addMember'])->name('members.store');
        Route::delete('/{id}/members/{userId}',[ChannelController::class, 'removeMember'])->name('members.destroy');
        Route::put('/{id}/members/{userId}/mute',[ChannelController::class, 'toggleMute'])->name('members.mute');
        Route::post('/{id}/join',              [ChannelController::class, 'join'])->name('join');

        // Read state
        Route::put('/{id}/star',        [ChannelController::class, 'toggleStar'])->name('star');
        Route::put('/{id}/read',        [ChannelController::class, 'markRead'])->name('read');
        Route::put('/{id}/mark-unread', [ChannelController::class, 'markUnread'])->name('mark-unread');

        // Messages (nested)
        Route::prefix('/{channelId}/messages')->name('messages.')->group(function () {
            Route::get('/',  [ChannelMessageController::class, 'index'])->name('index');
            Route::post('/', [ChannelMessageController::class, 'store'])->name('store');
            Route::put('/{messageId}',      [ChannelMessageController::class, 'update'])->name('update');
            Route::delete('/{messageId}',   [ChannelMessageController::class, 'destroy'])->name('destroy');
            Route::get('/{messageId}/thread',[ChannelMessageController::class, 'thread'])->name('thread');
            Route::put('/{messageId}/pin',  [ChannelMessageController::class, 'togglePin'])->name('pin');
            Route::post('/{messageId}/reactions',          [ChannelMessageController::class, 'addReaction'])->name('reactions.store');
            Route::delete('/{messageId}/reactions/{emoji}',[ChannelMessageController::class, 'removeReaction'])->name('reactions.destroy');
        });
    });

    // ── Comments (polymorphic) ────────────────────────────────────────────────
    Route::prefix('')->name('comments.')->group(function () {
        Route::get('/{entityType}/{entityId}/comments',  [CommentController::class, 'index'])->name('index');
        Route::post('/{entityType}/{entityId}/comments', [CommentController::class, 'store'])->name('store');
        Route::get('/comments/{commentId}/thread',       [CommentController::class, 'thread'])->name('thread');
        Route::put('/comments/{commentId}',              [CommentController::class, 'update'])->name('update');
        Route::delete('/comments/{commentId}',           [CommentController::class, 'destroy'])->name('destroy');
        Route::put('/comments/{commentId}/pin',          [CommentController::class, 'togglePin'])->name('pin');
        Route::post('/comments/{commentId}/reactions',          [CommentController::class, 'addReaction'])->name('reactions.store');
        Route::delete('/comments/{commentId}/reactions/{emoji}',[CommentController::class, 'removeReaction'])->name('reactions.destroy');
    });
});
