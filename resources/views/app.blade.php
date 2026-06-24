<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>ATLAS — {{ config('app.name') }}</title>

    {{-- PWA: installable + app-like di HP (Add to Home Screen, standalone fullscreen). --}}
    <link rel="manifest" href="/manifest.webmanifest">
    <meta name="theme-color" content="#2D8C3E">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">
    <meta name="apple-mobile-web-app-title" content="ATLAS">
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">

    {{-- Fonts self-hosted via @fontsource (Public Sans + Geist Mono), di-bundle di app.tsx. Tanpa CDN call. --}}

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    @inertiaHead
</head>
<body>
    @inertia
</body>
</html>
