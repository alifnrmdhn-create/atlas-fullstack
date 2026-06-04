<?php
// One-off QA untuk hasil derivasi Strategic Objective. Jalankan: php artisan tinker scripts/so-quality-check.php
// (di-load dalam konteks Laravel via tinker, jadi DB facade tersedia)

use Illuminate\Support\Facades\DB;

$res = json_decode(file_get_contents(storage_path('app/strategic-objective/results.json')), true);
$dbCodes = DB::table('Program')->pluck('code')->all();
$resCodes = array_column($res, 'code');

$missing = array_diff($dbCodes, $resCodes);
$extra = array_diff($resCodes, $dbCodes);

echo 'DB programs: '.count($dbCodes).' | result items: '.count($res).PHP_EOL;
echo 'code di DB tanpa hasil : '.($missing ? implode(',', $missing) : 'NONE').PHP_EOL;
echo 'code hasil tanpa di DB : '.($extra ? implode(',', $extra) : 'NONE').PHP_EOL;
echo str_repeat('=', 70).PHP_EOL;

$wc = [];
$flags = [];
foreach ($res as $r) {
    $o = $r['objective'];
    $n = str_word_count($o);
    $wc[] = $n;
    if ($n > 38) $flags[] = $r['code']." (panjang {$n} kata)";
    if ($n < 8) $flags[] = $r['code']." (pendek {$n} kata)";
    if (! str_ends_with(rtrim($o), '.')) $flags[] = $r['code'].' (tanpa titik)';
    if (preg_match('/[0-9]+([.,][0-9]+)?\s*%/', $o) || preg_match('/Rp\s*[0-9]/', $o)) {
        $flags[] = $r['code'].' (ANGKA: '.$o.')';
    }
}
sort($wc);
echo 'kata min/median/max: '.$wc[0].'/'.$wc[(int) (count($wc) / 2)].'/'.end($wc).PHP_EOL;
echo 'FLAGS: '.($flags ? PHP_EOL.'  - '.implode(PHP_EOL.'  - ', $flags) : 'tidak ada').PHP_EOL;
