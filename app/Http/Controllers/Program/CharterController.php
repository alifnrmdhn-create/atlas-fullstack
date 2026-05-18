<?php

namespace App\Http\Controllers\Program;

use App\Http\Controllers\Controller;
use App\Models\Program;
use App\Services\ProgramCharterService;
use App\Services\ProgramService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Charter mode — read-only single page mirroring the DKMR KPI Charter
 * PPT format. Edit mode lives at /programs/{id} (6 tabs); this is a
 * parallel route, not a seventh tab.
 *
 * Authorization mirrors ProgramController@show: per-user scope via
 * ProgramService::assertAccess (Gate "view-program" doesn't exist
 * separately in this codebase — view is gated at the service layer).
 *
 * Two response shapes from the same route:
 *   - Default (browser navigation): Inertia page (Programs/Charter)
 *   - Accept: application/json: raw payload — used by the multi-program
 *     PPTX exporter to batch-fetch many programs without page transitions.
 */
class CharterController extends Controller
{
    public function __construct(
        private readonly ProgramCharterService $charterService,
        private readonly ProgramService $programService,
    ) {}

    public function show(Request $request, Program $program): Response|JsonResponse
    {
        $this->programService->assertAccess($request->user(), $program->id);

        $payload = $this->charterService->assemble($program);

        if ($request->expectsJson()) {
            return response()->json(['data' => $payload]);
        }

        return Inertia::render('Programs/Charter', $payload);
    }
}
