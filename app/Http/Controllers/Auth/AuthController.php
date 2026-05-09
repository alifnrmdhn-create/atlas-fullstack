<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
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

        if (filter_var($identifier, FILTER_VALIDATE_EMAIL)) {
            throw ValidationException::withMessages([
                'identifier' => 'Gunakan NIK atau User ID, bukan email.',
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
            throw ValidationException::withMessages([
                'identifier' => 'NIK, User ID, atau password salah.',
            ]);
        }

        Auth::login($user);
        $request->session()->regenerate();

        // Home V2 (/) is now the canonical landing page; /dashboard is legacy
        // (still routable for power users via deep-link, not surfaced in UI).
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
