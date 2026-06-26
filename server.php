<?php

/**
 * Router dev-server untuk `php artisan serve` (override project-root).
 *
 * Identik dengan vendor/.../Foundation/resources/server.php KECUALI satu hal:
 * penulisan baris log request ke stdout dibungkus '@'. Tanpa ini, saat browser
 * memutus koneksi di tengah response (hard-refresh, cancel navigasi), tulis ke
 * php://stdout gagal dengan "Broken pipe (errno 32)" → PHP memunculkan Notice,
 * dan karena display_errors=STDOUT di CLI, Notice itu nyangkut di ATAS halaman.
 *
 * '@' membuat kegagalan tulis-log itu senyap (log tetap jalan saat koneksi sehat).
 * Hanya berlaku di dev — produksi memakai nginx + php-fpm via public/index.php,
 * file ini TIDAK dipakai sama sekali.
 *
 * Laravel memilih file ini otomatis: ServeCommand::serverCommand() memakai
 * base_path('server.php') bila ada, jika tidak baru fallback ke versi vendor.
 */

$publicPath = getcwd();

$uri = urldecode(
    parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? ''
);

// This file allows us to emulate Apache's "mod_rewrite" functionality from the
// built-in PHP web server. This provides a convenient way to test a Laravel
// application without having installed a "real" web server software here.
if ($uri !== '/' && file_exists($publicPath.$uri)) {
    return false;
}

$formattedDateTime = date('D M j H:i:s Y');

$requestMethod = $_SERVER['REQUEST_METHOD'];
$remoteAddress = $_SERVER['REMOTE_ADDR'].':'.$_SERVER['REMOTE_PORT'];

@file_put_contents('php://stdout', "[$formattedDateTime] $remoteAddress [$requestMethod] URI: $uri\n");

require_once $publicPath.'/index.php';
