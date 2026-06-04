<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthController extends Controller
{
    public function showLogin(): Response
    {
        return Inertia::render('Auth/Login');
    }

    public function login(Request $request): RedirectResponse
    {
        $request->validate([
            'identifier' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $identifier = trim($request->input('identifier'));

        // Rate limit brute-force: maks 5 percobaan GAGAL per identifier+IP per menit.
        // Di-clear saat login sukses agar user sah tidak terpenalti.
        $throttleKey = Str::lower($identifier) . '|' . $request->ip();
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $seconds = RateLimiter::availableIn($throttleKey);
            throw ValidationException::withMessages([
                'identifier' => "Too many login attempts. Please try again in {$seconds} seconds.",
            ]);
        }

        if (filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'identifier' => 'Use your NIK or User ID, not an email.',
            ]);
        }

        // Coba cocokkan identifier ke NIK atau User ID — email login dinonaktifkan.
        $user = User::query()
            ->where('isActive', true)
            ->where(function ($q) use ($identifier) {
                $q->where('nik', $identifier)
                  ->orWhere('userId', $identifier);
            })
            ->first();

        if (!$user || !$user->passwordHash || !Hash::check($request->input('password'), $user->passwordHash)) {
            // Hitung hanya kegagalan kredensial nyata (1 menit decay).
            RateLimiter::hit($throttleKey);
            throw ValidationException::withMessages([
                'identifier' => 'Incorrect NIK, User ID, or password.',
            ]);
        }

        RateLimiter::clear($throttleKey);
        Auth::login($user);
        $request->session()->regenerate();

        return redirect()->intended('/');
    }

    public function logout(Request $request): RedirectResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }
}
