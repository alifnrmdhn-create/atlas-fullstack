<?php

use App\Http\Controllers\AssignmentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\BlockerController;
use App\Http\Controllers\ChannelController;
use App\Http\Controllers\ChannelMessageController;
use App\Http\Controllers\CommentController;
use App\Http\Controllers\KpiController;
use App\Http\Controllers\MeetingController;
use App\Http\Controllers\MonthlyReportController;
use App\Http\Controllers\OrganizationController;
use App\Http\Controllers\PhaseController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\RiskReportController;
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

    // ── Meetings ──────────────────────────────────────────────────────────────
    Route::prefix('meetings')->name('meetings.')->group(function () {
        Route::get('/',              [MeetingController::class, 'index'])->name('index');
        Route::post('/',             [MeetingController::class, 'store'])->name('store');
        Route::get('/decisions',     [MeetingController::class, 'decisions'])->name('decisions');
        Route::get('/suggestions',   [MeetingController::class, 'suggestions'])->name('suggestions');
        Route::get('/{id}',          [MeetingController::class, 'show'])->name('show');
        Route::patch('/{id}',        [MeetingController::class, 'update'])->name('update');
        Route::delete('/{id}',       [MeetingController::class, 'destroy'])->name('destroy');

        // RSVP & attendees
        Route::post('/{id}/rsvp',                       [MeetingController::class, 'rsvp'])->name('rsvp');
        Route::post('/{id}/attendees',                  [MeetingController::class, 'addAttendee'])->name('attendees.store');
        Route::delete('/{id}/attendees/{userId}',       [MeetingController::class, 'removeAttendee'])->name('attendees.destroy');

        // Decisions
        Route::post('/{id}/decisions',                  [MeetingController::class, 'addDecision'])->name('decisions.store');
        Route::delete('/{id}/decisions/{decisionId}',   [MeetingController::class, 'destroyDecision'])->name('decisions.destroy');

        // Action items
        Route::get('/{id}/action-items',                [MeetingController::class, 'listActionItems'])->name('action-items.index');
        Route::post('/{id}/action-items',               [MeetingController::class, 'storeActionItem'])->name('action-items.store');
        Route::patch('/{id}/action-items/{itemId}',     [MeetingController::class, 'updateActionItem'])->name('action-items.update');
        Route::delete('/{id}/action-items/{itemId}',    [MeetingController::class, 'destroyActionItem'])->name('action-items.destroy');

        // Continuity
        Route::get('/{id}/continuity',  [MeetingController::class, 'continuity'])->name('continuity');
    });

    // ── Organization ──────────────────────────────────────────────────────────
    Route::prefix('organization')->name('organization.')->group(function () {
        Route::get('/hierarchy',  [OrganizationController::class, 'hierarchy'])->name('hierarchy');

        Route::get('/directorates',       [OrganizationController::class, 'directorates'])->name('directorates.index');
        Route::post('/directorates',      [OrganizationController::class, 'storeDirectorate'])->name('directorates.store');
        Route::patch('/directorates/{id}',[OrganizationController::class, 'updateDirectorate'])->name('directorates.update');
        Route::delete('/directorates/{id}',[OrganizationController::class, 'destroyDirectorate'])->name('directorates.destroy');

        Route::get('/units',       [OrganizationController::class, 'units'])->name('units.index');
        Route::post('/units',      [OrganizationController::class, 'storeUnit'])->name('units.store');
        Route::patch('/units/{id}',[OrganizationController::class, 'updateUnit'])->name('units.update');
        Route::delete('/units/{id}',[OrganizationController::class, 'destroyUnit'])->name('units.destroy');

        Route::get('/positions',              [OrganizationController::class, 'positions'])->name('positions.index');
        Route::post('/positions',             [OrganizationController::class, 'storePosition'])->name('positions.store');
        Route::patch('/positions/{id}',       [OrganizationController::class, 'updatePosition'])->name('positions.update');
        Route::delete('/positions/{id}',      [OrganizationController::class, 'destroyPosition'])->name('positions.destroy');
        Route::patch('/positions/{id}/assign',[OrganizationController::class, 'assignPosition'])->name('positions.assign');
    });

    // ── Real-time SSE + Presence ──────────────────────────────────────────────
    Route::get('/realtime/stream', [RealtimeController::class, 'stream'])->name('realtime.stream');
    Route::post('/realtime/ping',  [RealtimeController::class, 'ping'])->name('realtime.ping');

    // ── Monthly Reports ───────────────────────────────────────────────────────
    Route::prefix('monthly-reports')->name('monthly-reports.')->group(function () {
        Route::get('/',          [MonthlyReportController::class, 'index'])->name('index');
        Route::post('/',         [MonthlyReportController::class, 'store'])->name('store');
        Route::get('/{id}',      [MonthlyReportController::class, 'show'])->name('show');
        Route::put('/{id}',      [MonthlyReportController::class, 'update'])->name('update');
        Route::delete('/{id}',   [MonthlyReportController::class, 'destroy'])->name('destroy');
        Route::post('/{id}/upload',  [MonthlyReportController::class, 'upload'])->name('upload');
        Route::post('/{id}/submit',  [MonthlyReportController::class, 'submit'])->name('submit');
        Route::post('/{id}/approve', [MonthlyReportController::class, 'approve'])->name('approve');
    });

    // ── Risk Reports ──────────────────────────────────────────────────────────
    Route::prefix('risk-reports')->name('risk-reports.')->group(function () {
        Route::get('/',          [RiskReportController::class, 'index'])->name('index');
        Route::post('/',         [RiskReportController::class, 'store'])->name('store');
        Route::get('/{id}',      [RiskReportController::class, 'show'])->name('show');
        Route::put('/{id}',      [RiskReportController::class, 'update'])->name('update');
        Route::get('/{id}/ytd',  [RiskReportController::class, 'ytd'])->name('ytd');
        Route::post('/{id}/submit',  [RiskReportController::class, 'submit'])->name('submit');
        Route::post('/{id}/approve', [RiskReportController::class, 'approve'])->name('approve');
    });
});
