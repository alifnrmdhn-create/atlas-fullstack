<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Upload disks (scale-readiness S1.4)
    |--------------------------------------------------------------------------
    |
    | Disk tujuan upload, config-driven supaya migrasi ke object storage =
    | config-flip tanpa sentuh kode. Default LOKAL (perilaku sekarang).
    |
    | Multi-replica WAJIB object storage: disk lokal/volume Railway tak bisa
    | di-share antar-replica → file yang di-upload di replica A tak terlihat di
    | replica B. Saat siap (provision bucket):
    |   1. composer require league/flysystem-aws-s3-v3
    |   2. isi AWS_* / bucket di env (config/filesystems.php disk 's3' sudah ada)
    |   3. UPLOAD_PRIVATE_DISK=s3, UPLOAD_PUBLIC_DISK=s3 (atau bucket public terpisah)
    |
    | private = file ber-otorisasi (lampiran assignment, file laporan bulanan)
    |           — diserve via download ter-otentikasi.
    | public  = aset publik (avatar) — diserve via URL publik / signed.
    |
    */

    'private_disk' => env('UPLOAD_PRIVATE_DISK', 'local'),

    'public_disk' => env('UPLOAD_PUBLIC_DISK', 'public'),

    /*
    |--------------------------------------------------------------------------
    | Allowlist MIME untuk upload PUBLIK (/uploads — lampiran channel/avatar)
    |--------------------------------------------------------------------------
    |
    | Audit 2026-06-16: /uploads dulu tanpa allowlist → file disimpan ke disk
    | publik & dikembalikan sebagai URL same-origin /storage/* → user bisa
    | upload .html/.svg/.js dan dapat stored-XSS. Allowlist EKSPLISIT (bukan
    | prefix 'image/' yang mengizinkan image/svg+xml — SVG bisa memuat script).
    | Tanpa svg, html, js. Validasi via aturan `mimetypes:` (cek konten, bukan
    | sekadar ekstensi).
    |
    */
    'public_mimetypes' => [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'application/zip',
    ],

];
