<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Pages
    |--------------------------------------------------------------------------
    |
    | Override default vendor: paths default-nya `js/pages` (huruf kecil),
    | sedangkan direktori ATLAS adalah `js/Pages` (kapital, 89 file ter-track).
    | Di macOS (filesystem case-insensitive) bedanya tak terasa, tapi di Linux
    | (CI/produksi) finder gagal → semua assertInertia ->component() merah
    | dengan "Inertia page component file [...] does not exist" (CI run
    | 2026-06-10). Section ditulis LENGKAP karena mergeConfigFrom Laravel
    | shallow per top-level key — key 'pages' di sini menggantikan seluruh
    | section vendor. Section lain (ssr/testing/history) tetap dari vendor.
    |
    */

    'pages' => [

        'ensure_pages_exist' => false,

        'paths' => [

            resource_path('js/Pages'),

        ],

        'extensions' => [

            'js',
            'jsx',
            'svelte',
            'ts',
            'tsx',
            'vue',

        ],

    ],

];
