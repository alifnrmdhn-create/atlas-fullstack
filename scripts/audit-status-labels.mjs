#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
 * audit-status-labels — guardrail konsistensi label status ATLAS
 * ════════════════════════════════════════════════════════════════════
 * Masalah (audit 2026-06-25, lihat docs/status-vocabulary-unification-plan-2026-06.md):
 * enum status/priority/severity DI-RENDER MENTAH ke UI (UPPERCASE, tak
 * lewat i18n) — "IN_PROGRESS", "MEDIUM", "PENDING KASUB" — sehingga
 * terbaca seperti bug & tak konsisten dgn label kanonik di sebelahnya.
 *
 * Sumber kebenaran label = resources/js/lib/status.ts (workStatusLabel,
 * priorityLabel, severityLabel, approvalStatusLabel, healthLabel) +
 * lib/programStatus.ts. SEMUA render status WAJIB lewat helper itu.
 *
 * Gate ini menandai dua anti-pola render-mentah:
 *   (1) `.replace(/_/g, ' ')` pada field status/enum — "humanize" manual
 *       yang mem-bypass i18n & vocab kanonik.
 *   (2) JSX child `{x.priority}` / `{x.severity}` / `{x.status}` yang
 *       merender field enum SENDIRIAN (langsung diapit `}`), bukan lewat
 *       helper. Prop (`priority={x.priority}`), perbandingan (`x.status ===`),
 *       dan pemanggilan helper (`priorityLabel(x.priority)`) TIDAK kena.
 *
 * Strategi BASELINE (identik audit-breakpoints / audit-darkmode): snapshot
 * utang yang ADA ke status-labels-baseline.json (di-grandfather). Build
 * hijau utk utang lama, GAGAL kalau ada render-mentah BARU. Turunkan
 * bertahap saat migrasi: --update-baseline.
 *
 * Pengecualian per-baris: komentar `status-allow` di baris itu / persis di
 * atasnya. Pakai utk kasus yang memang bukan label status user-facing.
 *
 * Penggunaan:
 *   node scripts/audit-status-labels.mjs                 → enforce vs baseline (CI)
 *   node scripts/audit-status-labels.mjs --list          → daftar semua temuan
 *   node scripts/audit-status-labels.mjs --update-baseline → tulis ulang baseline
 * ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const root = process.cwd()
const baselinePath = join(root, 'scripts/status-labels-baseline.json')

const args = new Set(process.argv.slice(2))
const mode = args.has('--update-baseline') ? 'update'
  : args.has('--list') ? 'list'
  : 'enforce'

const ALLOW_TAG = /status-allow/

// (1) humanize manual enum status: <statusField>.replace(/_/g, ' '). Dibatasi
//   ke field status-ish saja (bukan section/pilarStrategis/HTTP status dll).
const ANTI_REPLACE = /\.(status|approvalStatus|toStatus|fromStatus|severity|priority|healthStatus)\s*\??\.\s*replace\(\s*\/_\/g\s*,\s*(['"`]) \2\s*\)/
// (2) render mentah field enum sebagai JSX child tunggal: {x.priority}
//   - guard `[^=\w$]` sebelum `{` → bukan prop `field={x.priority}` & bukan
//     interpolasi template `priority--${x.priority}` (className).
//   - field diapit `}` langsung → bukan `.status === ` / `.status)}` (helper)
const RAW_FIELD = /(^|[^=\w$])\{\s*[A-Za-z_$][\w.$]*\.(priority|severity|status|approvalStatus|healthStatus)\s*\}/

function walk(dir, exts, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, acc)
    else if (exts.has(extname(name))) acc.push(full)
  }
  return acc
}

const tsxFiles = [
  ...walk(join(root, 'resources/js/Pages'), new Set(['.tsx'])),
  ...walk(join(root, 'resources/js/components'), new Set(['.tsx'])),
  ...walk(join(root, 'resources/js/layouts'), new Set(['.tsx'])),
]

const violations = [] // { file, line, kind, text }

for (const file of tsxFiles) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (ALLOW_TAG.test(line) || (i > 0 && ALLOW_TAG.test(lines[i - 1]))) continue
    let kind = null
    if (ANTI_REPLACE.test(line)) kind = 'replace'
    else if (RAW_FIELD.test(line)) kind = 'raw-field'
    if (!kind) continue
    violations.push({ file: relative(root, file), line: i + 1, kind, text: line.trim().slice(0, 100) })
  }
}

const counts = {}
for (const v of violations) counts[v.file] = (counts[v.file] ?? 0) + 1

if (mode === 'list') {
  if (violations.length === 0) { console.log('✓ Tidak ada render status mentah terdeteksi.'); process.exit(0) }
  console.log(`Render status mentah: ${violations.length} total\n`)
  let cur = ''
  for (const v of violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (v.file !== cur) { console.log(`\n  ${v.file}`); cur = v.file }
    console.log(`    :${v.line}  [${v.kind}]  ${v.text}`)
  }
  process.exit(0)
}

if (mode === 'update') {
  const baseline = {}
  for (const f of Object.keys(counts).sort()) baseline[f] = counts[f]
  writeFileSync(baselinePath, JSON.stringify({
    _comment: 'Utang render status mentah yang di-grandfather, per file. Turunkan saat migrasi sampai 0. Regenerate: node scripts/audit-status-labels.mjs --update-baseline',
    _total: violations.length,
    counts: baseline,
  }, null, 2) + '\n')
  console.log(`✓ Baseline ditulis: ${violations.length} violation → scripts/status-labels-baseline.json`)
  process.exit(0)
}

// ── enforce ──
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')).counts ?? {})
  : {}

const regressions = []
for (const [f, n] of Object.entries(counts)) {
  if (n > (baseline[f] ?? 0)) regressions.push({ file: f, count: n, baseline: baseline[f] ?? 0 })
}
const improvable = []
for (const [f, allowed] of Object.entries(baseline)) {
  if ((counts[f] ?? 0) < allowed) improvable.push({ file: f, now: counts[f] ?? 0, baseline: allowed })
}

if (regressions.length > 0) {
  console.error('✗ Render status MENTAH baru terdeteksi (melebihi baseline):\n')
  for (const r of regressions) {
    console.error(`  ${r.file} — ${r.count}× sekarang, baseline ${r.baseline}×`)
    for (const v of violations.filter(v => v.file === r.file).slice(0, 6)) {
      console.error(`      :${v.line}  [${v.kind}]  ${v.text}`)
    }
  }
  console.error('\nPakem: render status WAJIB lewat lib/status.ts (workStatusLabel / priorityLabel / severityLabel / approvalStatusLabel).')
  console.error('Kalau ini memang bukan label status user-facing, tandai `status-allow` di baris itu.')
  console.error('Detail: node scripts/audit-status-labels.mjs --list')
  process.exit(1)
}

if (improvable.length > 0) {
  console.log('✓ Tidak ada render status mentah baru.')
  console.log('  Baseline bisa diketatkan — jalankan --update-baseline:')
  for (const i of improvable.slice(0, 20)) console.log(`    ${i.file}: ${i.now}× (baseline ${i.baseline}×)`)
} else {
  console.log(`✓ Tidak ada render status mentah baru. (${violations.length} di-grandfather)`)
}
process.exit(0)
