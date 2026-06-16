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

];
