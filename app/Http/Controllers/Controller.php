<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

abstract class Controller
{
    protected function jsonList(mixed $data, array $meta = []): JsonResponse
    {
        return response()->json([
            'data' => $data,
            'meta' => array_merge(
                ['total' => is_countable($data) ? count($data) : null],
                $meta
            ),
        ]);
    }
}
