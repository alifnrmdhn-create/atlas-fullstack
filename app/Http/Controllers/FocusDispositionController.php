<?php

namespace App\Http\Controllers;

use App\Auth\OrgScope;
use App\Models\FocusDisposition;
use App\Models\Notification;
use App\Models\Program;
use App\Services\BroadcastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Disposition item "Needs Action" di Focus — menutup loop tindak lanjut.
 *
 * Item Needs Action adalah sinyal turunan (lihat OrgSummaryService::needsAction);
 * sebelumnya klik item cuma melempar ke workspace program tanpa aksi. Controller
 * ini memberi 3 jalur follow-up yang konsisten dengan Clear the Path:
 *
 *   - SUPPORTED : kirim arahan/dukungan ke PIC (notifikasi ke program owner)
 *   - REROUTED  : teruskan ke atas (escalation dibuat client-side via /escalations,
 *                 id-nya dicatat di sini supaya item keluar dari Focus)
 *   - HANDLED   : tandai sudah ditangani / dismiss
 *
 * Semua aksi merekam FocusDisposition (per user+program+tag) sehingga
 * OrgSummaryService menyembunyikan item dari needsAction milik user.
 */
class FocusDispositionController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'programId'   => 'required|integer',
            'tag'         => 'required|in:approval,blocker,support',
            'action'      => 'required|in:SUPPORTED,REROUTED,HANDLED',
            'note'        => 'nullable|string|max:2000',
            'escalationId' => 'nullable|integer',
        ]);

        // SUPPORTED butuh arahan yang dikirim ke PIC — bukan dukungan kosong.
        if ($data['action'] === 'SUPPORTED' && strlen(trim($data['note'] ?? '')) < 5) {
            return response()->json([
                'message' => 'A note for the PIC is required (min 5 characters).',
                'errors'  => ['note' => ['This field is required.']],
            ], 422);
        }

        $program = Program::find($data['programId']);
        if (!$program) {
            return response()->json(['message' => 'Program not found.'], 404);
        }

        // Authz: hanya pemegang scope unit program (atau eksekutif) yang boleh
        // men-disposition. Selaras primitif coversUnit yang dipakai jalur lain.
        $scope = OrgScope::forUser($user);
        if (!$scope->coversUnit($program->ownerUnitId)) {
            abort(403, 'This program is outside your scope.');
        }

        // SUPPORTED → kirim arahan ke PIC (program owner). Lewati bila owner = diri
        // sendiri (atasan yang juga PIC) atau owner tak ada.
        if ($data['action'] === 'SUPPORTED' && $program->ownerId && $program->ownerId !== $user->id) {
            $this->notifyPic(
                $program->ownerId,
                $program->id,
                "{$user->name} memberi arahan untuk {$program->name}: " . trim($data['note']),
            );
        }

        $disposition = FocusDisposition::updateOrCreate(
            ['userId' => $user->id, 'programId' => $program->id, 'tag' => $data['tag']],
            [
                'action'       => $data['action'],
                'note'         => $data['note'] ?? null,
                'escalationId' => $data['escalationId'] ?? null,
            ],
        );

        // Mute window di OrgSummaryService disaring pada `updatedAt`. updateOrCreate
        // hanya menyentuh updatedAt bila ada atribut yang berubah; re-disposition
        // identik (mis. "Tandai ditangani" dua kali tanpa note) tidak akan bikin
        // dirty → window tak ter-reset. touch() menjamin window mulai ulang tiap aksi.
        $disposition->touch();

        // Item Needs Action di-derive di dalam payload program-summary yang
        // di-cache per-user 3 menit (OrganizationController::programSummary).
        // Tanpa invalidasi, loadOverview('refresh') sesudah disposition mengambil
        // payload BASI yang masih memuat item → "sudah dikirim dukungan tapi item
        // tetap muncul". Bust cache supaya rebuild berikutnya menerapkan filter.
        Cache::forget("program_summary:user:{$user->id}");

        return response()->json(['data' => $disposition], 201);
    }

    private function notifyPic(int $ownerId, int $programId, string $message): void
    {
        $notif = Notification::create([
            'userId'    => $ownerId,
            'type'      => 'FOCUS_SUPPORT',
            'message'   => $message,
            'source'    => "program:{$programId}",
            'createdAt' => now(),
            'state'     => 'UNREAD',
        ]);

        // FE handler membaca event.notification.id — payload WAJIB membungkus row.
        BroadcastService::toUsers('notification:created', [
            'notification' => $notif,
        ], [$ownerId]);
    }
}
