<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Correlation id + konteks request di SEMUA log (scale-readiness S0.1/S0.2).
 *
 * Tanpa ini, error 500 di stderr produksi adalah baris telanjang: tak ada
 * siapa, di-mana, atau request mana. Middleware ini menyuntikkan
 * {request_id, method, path, ip, user_id} ke Log::shareContext sehingga setiap
 * baris log dalam lifecycle request membawanya — di-format JSON di prod
 * (LOG_STDERR_FORMATTER) sehingga Railway log bisa di-query per-request/per-user.
 *
 * Request id menghormati header upstream (load balancer / proxy) bila ada,
 * dan di-echo balik di response header supaya bisa dikorelasikan dari sisi klien.
 *
 * Di-append ke grup `web` (setelah StartSession) supaya $request->user() sudah
 * ter-resolve untuk session auth.
 */
class LogRequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $request->headers->get('X-Request-Id') ?: (string) Str::uuid();
        $request->headers->set('X-Request-Id', $requestId);

        Log::shareContext([
            'request_id' => $requestId,
            'method' => $request->getMethod(),
            'path' => $request->path(),
            'ip' => $request->ip(),
            'user_id' => $request->user()?->id,
        ]);

        $response = $next($request);
        $response->headers->set('X-Request-Id', $requestId);

        return $response;
    }
}
