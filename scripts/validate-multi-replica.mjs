// Validasi multi-replica (scale-readiness S4.2) — membuktikan jaminan inti S1
// di luar transaksi test: lock database (cache_locks) memberi MUTUAL EXCLUSION
// lintas-proses, sehingga onOneServer() menjamin scheduled command tak jalan
// ganda di N-replica.
//
// Dijalankan via artisan tinker (akses penuh app + DB). Tak butuh CI; alat
// validasi manual saat menyiapkan scale-out. Pakai:
//   node scripts/validate-multi-replica.mjs
import { execSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const php = `<?php
$store = Illuminate\\Support\\Facades\\Cache::store('database');

// Replica A & B = dua lock instance owner berbeda, berbagi cache_locks via Postgres.
$a = $store->lock('s4-mutex-probe', 10);
$b = $store->lock('s4-mutex-probe', 10);

$aGot = $a->get();
$bBlocked = ! $b->get();   // B harus GAGAL selagi A pegang
$a->release();
$bAfter = $b->get();       // setelah release, B boleh
$b->release();

echo json_encode(['aGot' => $aGot, 'bBlocked' => $bBlocked, 'bAfter' => $bAfter]) . "\\n";
`

const tmp = join(tmpdir(), `atlas-s4-validate-${process.pid}.php`)
writeFileSync(tmp, php)
let out
try {
  out = execSync(`php artisan tinker ${tmp}`, { encoding: 'utf8' })
} finally {
  try { rmSync(tmp) } catch { /* noop */ }
}
const m = out.match(/\{.*\}/)
if (!m) { console.error('Tak ada output JSON:\n', out); process.exit(1) }

const r = JSON.parse(m[0])
const ok = r.aGot && r.bBlocked && r.bAfter
console.log('Replica A acquire   :', r.aGot ? 'OK' : 'GAGAL')
console.log('Replica B terblokir :', r.bBlocked ? 'OK (mutual exclusion)' : 'GAGAL — DUA replica pegang lock!')
console.log('Replica B pasca-rel :', r.bAfter ? 'OK' : 'GAGAL')
console.log(ok
  ? '\n✓ MUTUAL EXCLUSION TERBUKTI — onOneServer aman di multi-replica.'
  : '\n✗ GAGAL — scheduled command bisa jalan ganda di multi-replica.')
process.exit(ok ? 0 : 1)
