<?php

use App\Http\Controllers\AssignmentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\BlockerController;
use App\Http\Controllers\ChannelController;
use App\Http\Controllers\ChannelMessageController;
use App\Http\Controllers\CommentController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\EscalationController;
use App\Http\Controllers\ExecutionGridController;
use App\Http\Controllers\PerformanceController;
use App\Http\Controllers\AdminThresholdsController;
use App\Http\Controllers\PilotMetricsController;
use App\Http\Controllers\KpiController;
use App\Http\Controllers\MeetingController;
use App\Http\Controllers\MonthlyReportController;
use App\Http\Controllers\OrganizationController;
use App\Http\Controllers\PhaseController;
use App\Http\Controllers\Program\CharterController;
use App\Http\Controllers\ProgramController;
use App\Http\Controllers\RealtimeController;
use App\Http\Controllers\RiskReportController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\WorkspaceController;
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

    // Home — PDCA two-column dashboard (KPI Achievement + Leading Program).
    Route::get('/', function (\Illuminate\Http\Request $request, \App\Services\ScorecardSummaryService $scorecard) {
        return Inertia::render('HomeView', [
            'scorecardSnapshot' => $scorecard->homeSnapshot($request->user()),
        ]);
    })->name('home');
    // Workspace overview JSON — dipakai HomeView untuk agregasi cross-modul
    // (lihat resources/js/context/workspace.tsx). Tidak punya halaman Inertia.
    Route::get('/workspace/overview', [WorkspaceController::class, 'workspaceOverview'])->name('workspace.overview');
    // Transitional redirect: bookmark/URL lama `/dashboard` → home.
    Route::get('/dashboard', fn () => redirect('/'));
    Route::get('/roadmap', fn () => Inertia::render('RoadmapView'))->name('roadmap');
    Route::get('/execution', fn () => Inertia::render('WorkboardView'))->name('execution');
    // Task detail URL → redirect ke Workboard dengan query param ?task={id}
    // (2026-05-21). Workboard auto-open modal saat query terdeteksi. URL deep
    // link tetap valid (share, bookmark) tapi visual surface single — modal.
    Route::get('/execution/tasks/{id}', function ($id) {
        return redirect("/execution?task={$id}");
    })->name('execution.tasks.show');
    Route::get('/penugasan', fn () => Inertia::render('AssignmentsView'))->name('penugasan');
    Route::get('/fokus', fn () => Inertia::render('InboxView'))->name('fokus');
    Route::get('/goals', fn () => Inertia::render('GoalsView'))->name('goals');
    Route::get('/activity', fn () => Inertia::render('ActivityView'))->name('activity');
    Route::get('/reports', fn () => Inertia::render('ReportsView'))->name('reports');
    Route::get('/jadwal', fn () => Inertia::render('ScheduleView'))->name('jadwal');
    Route::get('/laporan-bulanan', fn () => Inertia::render('MonthlyReportView'))->name('laporan-bulanan');
    Route::get('/laporan-bulanan/{id}', [MonthlyReportController::class, 'show'])->name('laporan-bulanan.show');
    // Halaman dashboard Risiko standalone DIHILANGKAN dari discovery (2026-06-02):
    // ATLAS bukan app manajemen risiko. API /risk-reports/* (di bawah) tetap hidup
    // untuk Monthly Report DIMR yang berformat risiko. Lihat feedback_atlas_not_risk_app.
    Route::get('/search', [WorkspaceController::class, 'search'])->name('search');
    Route::get('/presence', fn () => Inertia::render('PresenceView'))->name('presence');
    Route::get('/profile', [WorkspaceController::class, 'profile'])->name('profile');
    Route::put('/profile', [WorkspaceController::class, 'updateProfile'])->name('profile.update');
    Route::get('/settings', fn () => Inertia::render('SettingsView'))->name('settings');
    Route::post('/auth/change-password', [WorkspaceController::class, 'changePassword'])->name('auth.change-password');
    Route::get('/playbook', fn () => Inertia::render('PlaybookView'))->name('playbook');
    // Pusat Bantuan — friendly task-oriented entry point untuk operator/onboarding.
    // Playbook tetap eksis sebagai dokumen rinci yang dilink dari sini.
    Route::get('/panduan', fn () => Inertia::render('PanduanView'))->name('panduan');
    Route::get('/executive', [\App\Http\Controllers\ExecutiveSummaryController::class, 'show'])->name('executive');
    // Serve curated markdown docs (single source = base_path('docs/')). Whitelist-gated
    // to prevent leaking internal planning/architecture files. Add filename to $allowed
    // when surfacing a new doc to authenticated users.
    Route::get('/docs/{file}', function (string $file) {
        $allowed = ['ATLAS_PLAYBOOK.md'];
        abort_unless(in_array($file, $allowed, true), 404);
        $path = base_path("docs/{$file}");
        abort_unless(is_file($path), 404);
        return response()->file($path, ['Content-Type' => 'text/markdown; charset=UTF-8']);
    })->where('file', '[A-Za-z0-9_.-]+\.md')->name('docs.show');
    // Internal — design system preview (foundation primitives)
    Route::get('/design-system', fn () => Inertia::render('DesignSystemView'))->name('design-system');
    // Post-MVP — Pilot DKM metrics dashboard (admin-only)
    Route::get('/admin/pilot-metrics',     [PilotMetricsController::class, 'index'])->name('admin.pilot-metrics');
    Route::get('/admin/pilot-metrics/api', [PilotMetricsController::class, 'api'])->name('admin.pilot-metrics.api');

    // Post-MVP — Dynamic threshold settings (superadmin-only)
    Route::get('/admin/thresholds',        [AdminThresholdsController::class, 'index'])->name('admin.thresholds');
    Route::patch('/admin/thresholds',      [AdminThresholdsController::class, 'update'])->name('admin.thresholds.update');
    Route::post('/admin/thresholds/reset', [AdminThresholdsController::class, 'reset'])->name('admin.thresholds.reset');
    Route::get('/admin/orgs', fn () => Inertia::render('AdminOrgsView'))->name('admin.orgs');
    Route::get('/admin/users', fn () => Inertia::render('AdminUsersView'))->name('admin.users');
    Route::get('/admin/positions', fn () => Inertia::render('AdminPositionsView'))->name('admin.positions');
    Route::get('/admin/roles', fn () => Inertia::render('AdminRolesView'))->name('admin.roles');

    Route::get('/my-work', [WorkspaceController::class, 'myWork'])->name('my-work');
    Route::get('/apms/kpi', [WorkspaceController::class, 'apmsKpi'])->name('apms.kpi');
    Route::get('/system/status', [WorkspaceController::class, 'systemStatus'])->name('system.status');
    Route::get('/search/saved', [WorkspaceController::class, 'savedSearches'])->name('search.saved');
    Route::get('/users', [WorkspaceController::class, 'users'])->name('users.index');
    Route::post('/users', [WorkspaceController::class, 'storeUser'])->name('users.store');
    Route::get('/users/directory', [WorkspaceController::class, 'usersDirectory'])->name('users.directory');
    Route::get('/users/presence', [WorkspaceController::class, 'usersPresence'])->name('users.presence');
    Route::put('/users/me/status', [WorkspaceController::class, 'updateMyStatus'])->name('users.me.status');
    Route::post('/users/me/tours-completed', [WorkspaceController::class, 'markTourCompleted'])->name('users.me.tours-completed');
    Route::patch('/users/{id}', [WorkspaceController::class, 'updateUser'])->name('users.update');
    Route::get('/inbox/today', [WorkspaceController::class, 'inboxToday'])->name('inbox.today');
    Route::get('/notifications', [WorkspaceController::class, 'notifications'])->name('notifications.index');
    Route::put('/notifications/read-all', [WorkspaceController::class, 'readAllNotifications'])->name('notifications.read-all');
    Route::put('/notifications/{id}/read', [WorkspaceController::class, 'readNotification'])->name('notifications.read');
    Route::put('/notifications/{id}/dismiss', [WorkspaceController::class, 'dismissNotification'])->name('notifications.dismiss');
    Route::get('/role-configs', [WorkspaceController::class, 'roleConfigs'])->name('role-configs.index');
    Route::put('/role-configs/{role}', [WorkspaceController::class, 'updateRoleConfig'])->name('role-configs.update');
    Route::get('/focus-blocks', [WorkspaceController::class, 'focusBlocks'])->name('focus-blocks.index');
    Route::post('/focus-blocks', [WorkspaceController::class, 'storeFocusBlock'])->name('focus-blocks.store');
    Route::delete('/focus-blocks/{id}', [WorkspaceController::class, 'destroyFocusBlock'])->name('focus-blocks.destroy');
    Route::post('/dm/open', [WorkspaceController::class, 'openDirectMessage'])->name('dm.open');
    Route::post('/reminders', [WorkspaceController::class, 'storeReminder'])->name('reminders.store');
    Route::post('/analytics/focus-interactions', [WorkspaceController::class, 'recordFocusInteraction'])->name('analytics.focus-interactions');
    Route::get('/analytics/user-activity', [WorkspaceController::class, 'userActivity'])->name('analytics.user-activity');
    Route::get('/analytics/user-activity/{id}', [WorkspaceController::class, 'userActivityDetail'])->name('analytics.user-activity.detail');
    Route::get('/saved-messages', [WorkspaceController::class, 'savedMessages'])->name('saved-messages.index');
    Route::post('/saved-messages/{messageId}', [WorkspaceController::class, 'storeSavedMessage'])->name('saved-messages.store');
    Route::delete('/saved-messages/{messageId}', [WorkspaceController::class, 'destroySavedMessage'])->name('saved-messages.destroy');
    Route::get('/unfurl', [WorkspaceController::class, 'unfurl'])->name('unfurl');
    Route::post('/uploads', [WorkspaceController::class, 'upload'])->name('uploads.store');

    // ── Programs ─────────────────────────────────────────────────────────────
    Route::prefix('programs')->name('programs.')->group(function () {
        Route::get('/',              [ProgramController::class, 'index'])->name('index');
        Route::post('/',             [ProgramController::class, 'store'])->name('store');
        Route::get('/archived',      [ProgramController::class, 'archived'])->name('archived');
        Route::get('/timeline-all',  [ProgramController::class, 'timelineAll'])->name('timeline-all');
        Route::get('/execution-pulse',[ProgramController::class, 'executionPulse'])->name('execution-pulse');
        Route::get('/execution-matrix', [ExecutionGridController::class, 'executionMatrix'])->name('execution-matrix');

        Route::get('/{id}',          [ProgramController::class, 'show'])->name('show');
        Route::put('/{id}',          [ProgramController::class, 'update'])->name('update');
        Route::delete('/{id}',       [ProgramController::class, 'destroy'])->name('destroy');

        // Approval workflow
        Route::post('/{id}/submit',   [ProgramController::class, 'submit'])->name('submit');
        Route::post('/{id}/activate', [ProgramController::class, 'activate'])->name('activate');
        Route::post('/{id}/approve',  [ProgramController::class, 'approve'])->name('approve');
        Route::post('/{id}/reject',   [ProgramController::class, 'reject'])->name('reject');
        Route::post('/{id}/withdraw', [ProgramController::class, 'withdraw'])->name('withdraw');
        Route::patch('/{id}/archive', [ProgramController::class, 'archive'])->name('archive');
        Route::patch('/{id}/restore', [ProgramController::class, 'restore'])->name('restore');

        // Charter View (read-only, parallel to /{id})
        Route::get('/{program}/charter', [CharterController::class, 'show'])->name('charter');

        // Sub-resources
        Route::get('/{id}/execution-grid',      [ExecutionGridController::class, 'executionGrid'])->name('execution-grid');
        Route::get('/{id}/execution-grid.xlsx', [ExecutionGridController::class, 'exportXlsx'])->name('execution-grid.xlsx');
        Route::get('/{id}/execution-achievement', [ProgramController::class, 'executionAchievement'])->name('execution-achievement');
        Route::get('/{id}/health',        [ProgramController::class, 'health'])->name('health');
        Route::get('/{id}/workstreams',   [ProgramController::class, 'workstreams'])->name('workstreams');
        Route::get('/{id}/kpi-links',     [ProgramController::class, 'kpiLinks'])->name('kpi-links.index');
        Route::post('/{id}/kpi-links',    [ProgramController::class, 'addKpiLink'])->name('kpi-links.store');
        Route::delete('/{id}/kpi-links/{code}', [ProgramController::class, 'removeKpiLink'])->name('kpi-links.destroy');
        Route::post('/{id}/kpi-internal',  [ProgramController::class, 'storeKpiInternal'])->name('kpi-internal.store');
        Route::get('/{id}/approval-log',   [ProgramController::class, 'approvalLog'])->name('approval-log');
        Route::get('/{id}/progress-log',   [ProgramController::class, 'progressLog'])->name('progress-log.index');
        Route::post('/{id}/progress-log',  [ProgramController::class, 'storeProgressLog'])->name('progress-log.store');
        Route::get('/{id}/reflection-meta', [ProgramController::class, 'reflectionMeta'])->name('reflection-meta');
    });

    // ── Tasks ─────────────────────────────────────────────────────────────────
    Route::prefix('tasks')->name('tasks.')->group(function () {
        Route::get('/',              [TaskController::class, 'index'])->name('index');
        Route::post('/',             [TaskController::class, 'store'])->name('store');
        // Static routes (no {id}) must precede /{id} routes — Laravel matches top-down.
        Route::get('/{id}',          [TaskController::class, 'show'])->name('show');
        Route::patch('/{id}',        [TaskController::class, 'update'])->name('update');
        Route::delete('/{id}',       [TaskController::class, 'destroy'])->name('destroy');
        Route::put('/{id}/status',   [TaskController::class, 'updateStatus'])->name('status');
        Route::get('/{id}/status-log', [TaskController::class, 'statusLog'])->name('status-log');
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

    // ── Workstreams ─────────────────────────────────────────────────────────
    Route::prefix('workstreams')->name('workstreams.')->group(function () {
        Route::get('/',        [WorkspaceController::class, 'workstreams'])->name('index');
        Route::post('/',       [WorkspaceController::class, 'storeWorkstream'])->name('store');
        Route::get('/{id}',    [WorkspaceController::class, 'showWorkstream'])->name('show');
        Route::put('/{id}',    [WorkspaceController::class, 'updateWorkstream'])->name('update');
        Route::delete('/{id}', [WorkspaceController::class, 'destroyWorkstream'])->name('destroy');
        Route::post('/{id}/phases', [PhaseController::class, 'storeForWorkstream'])->name('phases.store');
    });

    // ── Blockers ──────────────────────────────────────────────────────────────
    Route::prefix('blockers')->name('blockers.')->group(function () {
        Route::get('/',              [BlockerController::class, 'index'])->name('index');
        Route::post('/',             [BlockerController::class, 'store'])->name('store');
        Route::put('/{id}/status',   [BlockerController::class, 'updateStatus'])->name('status');
        Route::patch('/{id}',        [BlockerController::class, 'update'])->name('update');
        Route::delete('/{id}',       [BlockerController::class, 'destroy'])->name('destroy');
        // Sprint 3 — inline edit countermeasure dari panel PICA (tidak ubah status)
        Route::patch('/{id}/resolution', [BlockerController::class, 'updateResolution'])->name('resolution');
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

        // Sprint 3 — PICA Composite View Context
        Route::get('/{id}/pica-context', [MeetingController::class, 'picaContext'])->name('pica-context');
    });

    // ── Organization ──────────────────────────────────────────────────────────
    Route::prefix('organization')->name('organization.')->group(function () {
        Route::get('/hierarchy',       [OrganizationController::class, 'hierarchy'])->name('hierarchy');
        Route::get('/program-summary', [OrganizationController::class, 'programSummary'])->name('program-summary');

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

    // ── Real-time event delivery (polling) + Presence ─────────────────────────
    // SSE di-drop karena tiap koneksi menahan 1 PHP thread sampai TTL — exhaust
    // pool dengan beberapa user simultan. Polling: tiap request short-lived.
    Route::get('/realtime/poll',                    [RealtimeController::class, 'poll'])->name('realtime.poll');
    Route::post('/realtime/ping',                   [RealtimeController::class, 'ping'])->name('realtime.ping');
    Route::post('/realtime/typing/{channelId}',     [RealtimeController::class, 'typing'])->name('realtime.typing');

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
        Route::get('/{id}/auto-draft', [MonthlyReportController::class, 'autoDraft'])->name('auto-draft');
    });

    // ── Performance (KPI) ────────────────────────────────────────────────────
    // Role-scoped sejak 2026-05-29 (sebelumnya SUPERADMIN-only): EnsurePerformanceAccess
    // mengizinkan SUPERADMIN + anggota direktorat yang punya data scorecard (kini
    // DIR-KMR). Data scoping per-divisi dilakukan di PerformanceController (OrgScope).
    // Sidebar visibility = auth.user.canAccessPerformance (HandleInertiaRequests).
    Route::middleware(\App\Http\Middleware\EnsurePerformanceAccess::class)
        ->prefix('performance')->name('performance.')->group(function () {
        Route::get('/kolegial',           [PerformanceController::class, 'kolegial'])->name('kolegial');
        Route::get('/kolegial/{slug}',    [PerformanceController::class, 'kolegialDetail'])->name('kolegial.detail');
        Route::get('/scorecard',          [PerformanceController::class, 'scorecard'])->name('scorecard');
        // KPI Divisi & KPI Saya — diperkenalkan Sprint 1; full implementation Sprint 2.
        Route::get('/divisi/{kode?}',     [PerformanceController::class, 'divisi'])->name('divisi');
        Route::get('/me',                 [PerformanceController::class, 'me'])->name('me');
        Route::get('/individu',           [PerformanceController::class, 'individu'])->name('individu');
        Route::get('/individu/{id}',      [PerformanceController::class, 'individuDetail'])->name('individu.detail');
        // Sprint 4 — Commitment Ledger
        Route::get('/individu/{id}/ledger', [PerformanceController::class, 'commitmentLedger'])->name('individu.ledger');
    });

    // ── Escalations (Sprint 4 — Clear the Path) ───────────────────────────────
    Route::prefix('escalations')->name('escalations.')->group(function () {
        Route::get('/',              [EscalationController::class, 'index'])->name('index');
        Route::post('/',             [EscalationController::class, 'store'])->name('store');
        Route::get('/{id}',          [EscalationController::class, 'show'])->name('show');
        Route::post('/{id}/commit',  [EscalationController::class, 'commit'])->name('commit');
        Route::post('/{id}/reroute', [EscalationController::class, 'reroute'])->name('reroute');
        Route::post('/{id}/decline', [EscalationController::class, 'decline'])->name('decline');
        Route::post('/{id}/resolve', [EscalationController::class, 'resolve'])->name('resolve');
    });

    // ── Form autosave / drafts (Sprint 6 — Mei 2026) ──────────────────────────
    // formKey format konvensi: "{entityType}:{entityId}:{formName}",
    // mis. "program:123:progressLog". Whitelist regex cegah path traversal.
    Route::prefix('drafts')->name('drafts.')->group(function () {
        Route::get('/{formKey}',    [DraftController::class, 'show'])->name('show');
        Route::put('/{formKey}',    [DraftController::class, 'upsert'])->name('upsert');
        Route::delete('/{formKey}', [DraftController::class, 'destroy'])->name('destroy');
    })->where('formKey', '[A-Za-z0-9:_\-\.]+');

    // ── Risk Reports ──────────────────────────────────────────────────────────
    Route::prefix('risk-reports')->name('risk-reports.')->group(function () {
        Route::get('/',          [RiskReportController::class, 'index'])->name('index');
        Route::post('/',         [RiskReportController::class, 'store'])->name('store');
        Route::get('/{id}',      [RiskReportController::class, 'show'])->name('show');
        Route::put('/{id}',      [RiskReportController::class, 'update'])->name('update');
        Route::delete('/{id}',   [RiskReportController::class, 'destroy'])->name('destroy');
        Route::get('/{id}/ytd',  [RiskReportController::class, 'ytd'])->name('ytd');
        Route::post('/{id}/submit',  [RiskReportController::class, 'submit'])->name('submit');
        Route::post('/{id}/approve', [RiskReportController::class, 'approve'])->name('approve');
    });
});
