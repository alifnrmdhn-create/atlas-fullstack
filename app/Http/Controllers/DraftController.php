<?php

namespace App\Http\Controllers;

use App\Models\FormDraft;
use App\Services\FeatureFlagService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Sprint 6 — Form autosave / draft persistence.
 *
 * 3 endpoint:
 *   GET    /drafts/{formKey}  → ambil draft user (atau null kalau tidak ada/expired)
 *   PUT    /drafts/{formKey}  → upsert. FWW + 409 saat (clientId mismatch && version lebih lama)
 *   DELETE /drafts/{formKey}  → hapus (user submit success / explicit discard)
 *
 * Owner-only: setiap query `where('userId', $user->id)` — tidak ada path
 * cross-user. Tidak butuh policy class — guard inline cukup.
 */
class DraftController extends Controller
{
    /**
     * GET /drafts/{formKey}
     *
     * Selalu 200. Body: { data: FormDraft | null }.
     * Draft expired di-treat sebagai tidak ada (return null) — tidak 404.
     */
    public function show(Request $request, string $formKey): JsonResponse
    {
        if (!$this->autosaveEnabled($request)) {
            return response()->json(['data' => null]);
        }

        $user = $request->user();
        $draft = FormDraft::query()
            ->forUser($user->id)
            ->forKey($formKey)
            ->notExpired()
            ->first();

        return response()->json(['data' => $draft]);
    }

    /**
     * PUT /drafts/{formKey}
     *
     * Upsert. Increment version. Refresh expiresAt.
     *
     * Conflict (First-Write-Wins): kalau draft existing punya clientId berbeda
     * DAN request.version lebih rendah dari server, kita return 409 + server state.
     * FE bertanggung jawab decide: merge/overwrite + retry dengan version baru.
     */
    public function upsert(Request $request, string $formKey): JsonResponse
    {
        if (!$this->autosaveEnabled($request)) {
            return response()->json(['error' => 'autosave-disabled'], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        $data = $request->validate([
            'payload'    => 'required|array',
            'entityType' => 'nullable|string|max:40',
            'entityId'   => 'nullable|integer',
            'clientId'   => 'nullable|string|max:40',
            'version'    => 'nullable|integer|min:0',
        ]);

        // Payload size guard. json_encode dipakai sebagai proxy storage size.
        $encoded = json_encode($data['payload']);
        if ($encoded === false || strlen($encoded) > FormDraft::maxPayloadBytes()) {
            return response()->json([
                'error' => 'payload-too-large',
                'limit' => FormDraft::maxPayloadBytes(),
            ], Response::HTTP_REQUEST_ENTITY_TOO_LARGE);
        }

        $user = $request->user();
        $existing = FormDraft::query()
            ->forUser($user->id)
            ->forKey($formKey)
            ->first();

        // FWW conflict check: tab lain (clientId beda) sudah menyimpan version lebih
        // tinggi. Tolak — minta FE refresh dulu.
        if ($existing
            && isset($data['clientId'], $data['version'])
            && $existing->clientId
            && $existing->clientId !== $data['clientId']
            && $data['version'] < $existing->version
        ) {
            return response()->json([
                'error'  => 'version-conflict',
                'server' => [
                    'version'      => $existing->version,
                    'clientId'     => $existing->clientId,
                    'lastEditedAt' => $existing->lastEditedAt,
                ],
            ], Response::HTTP_CONFLICT);
        }

        $draft = $existing ?? new FormDraft([
            'userId'  => $user->id,
            'formKey' => $formKey,
            'version' => 0,
        ]);

        $draft->fill([
            'userId'       => $user->id,
            'formKey'      => $formKey,
            'entityType'   => $data['entityType'] ?? $draft->entityType,
            'entityId'     => $data['entityId']   ?? $draft->entityId,
            'clientId'     => $data['clientId']   ?? null,
            'payload'      => $data['payload'],
            'version'      => ($existing?->version ?? 0) + 1,
            'lastEditedAt' => now(),
            'expiresAt'    => FormDraft::expirationFromNow(),
        ])->save();

        return response()->json([
            'data' => [
                'version'      => $draft->version,
                'lastEditedAt' => $draft->lastEditedAt,
                'expiresAt'    => $draft->expiresAt,
            ],
        ]);
    }

    /**
     * DELETE /drafts/{formKey}
     *
     * Hard delete. Dipakai saat submit success atau explicit user discard.
     * Tidak surface 404 kalau tidak ada — idempotent.
     */
    public function destroy(Request $request, string $formKey): Response
    {
        if (!$this->autosaveEnabled($request)) {
            return response()->noContent();
        }

        $user = $request->user();
        FormDraft::query()
            ->forUser($user->id)
            ->forKey($formKey)
            ->delete();

        return response()->noContent();
    }

    private function autosaveEnabled(Request $request): bool
    {
        return FeatureFlagService::isEnabled('autosave', $request->user());
    }
}
