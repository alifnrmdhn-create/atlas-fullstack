<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <title>@yield('code') · ATLAS</title>
    {{-- Resolve theme before paint to avoid a flash: prefer the user's saved
         choice (same key the SPA uses), else the OS preference. These pages are
         standalone (no Vite/app shell) so they can render even when the app
         bundle itself fails — hence the inline script + inline CSS. --}}
    <script>
        (function () {
            try {
                var t = localStorage.getItem('atlas.theme');
                if (t !== 'light' && t !== 'dark') {
                    t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
                }
                document.documentElement.setAttribute('data-theme', t);
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }
        })();
    </script>
    <style>
        :root {
            --bg: #0a0c0a; --fg: #e9ebe9; --muted: #8b9389;
            --card: #121512; --border: rgba(255, 255, 255, .08);
            --brand: #34d399; --brand-fill: #2e8b4e; --on-brand: #ffffff;
            --code: rgba(255, 255, 255, .06);
        }
        html[data-theme="light"] {
            --bg: #f6f8f6; --fg: #15211a; --muted: #5a6a5f;
            --card: #ffffff; --border: rgba(20, 40, 28, .10);
            --brand: #2e8b4e; --brand-fill: #2e8b4e; --on-brand: #ffffff;
            --code: rgba(20, 50, 30, .05);
        }
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; }
        body {
            display: flex; align-items: center; justify-content: center;
            padding: 24px;
            background: var(--bg); color: var(--fg);
            font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        .err {
            width: 100%; max-width: 440px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 32px 28px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .err__brand {
            display: inline-flex; align-items: center; gap: 9px;
            margin-bottom: 22px;
        }
        .err__logo {
            width: 30px; height: 30px; border-radius: 8px;
            background: var(--brand-fill); color: var(--on-brand);
            display: grid; place-items: center;
            font-weight: 800; font-size: 17px; letter-spacing: -.02em;
        }
        .err__wordmark { font-weight: 800; letter-spacing: .14em; font-size: 15px; }
        .err__code {
            font-size: 64px; font-weight: 800; line-height: 1;
            letter-spacing: -.04em; color: var(--brand);
            font-variant-numeric: tabular-nums;
            margin: 4px 0 14px;
        }
        .err__title { font-size: 19px; font-weight: 700; margin: 0 0 8px; letter-spacing: -.01em; }
        .err__msg { font-size: 14px; line-height: 1.55; color: var(--muted); margin: 0 auto 24px; max-width: 36ch; }
        .err__btn {
            display: inline-flex; align-items: center; gap: 7px;
            padding: 11px 20px; min-height: 44px;
            background: var(--brand-fill); color: var(--on-brand);
            border-radius: 10px; text-decoration: none;
            font-weight: 600; font-size: 14px;
            transition: filter .14s ease;
        }
        .err__btn:hover { filter: brightness(1.08); }
        .err__btn svg { width: 15px; height: 15px; }
    </style>
</head>
<body>
    <main class="err">
        <div class="err__brand">
            <span class="err__logo">A</span>
            <span class="err__wordmark">ATLAS</span>
        </div>
        <div class="err__code">@yield('code')</div>
        <h1 class="err__title">@yield('title')</h1>
        <p class="err__msg">@yield('message')</p>
        <a class="err__btn" href="{{ url('/') }}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M10 12 6 8l4-4"/>
            </svg>
            @yield('action', 'Kembali ke ATLAS')
        </a>
    </main>
</body>
</html>
