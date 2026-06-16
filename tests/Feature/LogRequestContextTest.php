<?php

namespace Tests\Feature;

use App\Http\Middleware\LogRequestContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * Mengunci middleware correlation-id (scale-readiness S0): setiap response
 * web membawa header X-Request-Id, header upstream dihormati (load balancer),
 * dan konteks request disuntik ke Log::shareContext sehingga log produksi
 * (stderr JSON) actionable per-request/per-user.
 */
class LogRequestContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_response_carries_generated_request_id(): void
    {
        $res = $this->get('/login');
        $res->assertOk();
        $this->assertNotEmpty($res->headers->get('X-Request-Id'), 'Response wajib punya X-Request-Id.');
    }

    public function test_upstream_request_id_is_honored(): void
    {
        $res = $this->withHeaders(['X-Request-Id' => 'upstream-corr-123'])->get('/login');
        $this->assertSame('upstream-corr-123', $res->headers->get('X-Request-Id'));
    }

    public function test_middleware_shares_request_metadata_into_logs(): void
    {
        $captured = [];
        Log::listen(function ($message) use (&$captured) {
            $captured = $message->context;
        });

        $request = Request::create('/programs/42/comments', 'POST');
        (new LogRequestContext())->handle($request, function () {
            // Log apa pun di dalam request harus membawa konteks yang di-share.
            Log::info('handler executed');
            return new Response('ok');
        });

        $this->assertSame('POST', $captured['method'] ?? null);
        $this->assertSame('programs/42/comments', $captured['path'] ?? null);
        $this->assertArrayHasKey('request_id', $captured);
        $this->assertArrayHasKey('user_id', $captured);
    }
}
