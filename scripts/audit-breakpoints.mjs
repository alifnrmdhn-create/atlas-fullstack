#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
 * audit-breakpoints — guardrail breakpoint baku ATLAS
 * ════════════════════════════════════════════════════════════════════
 * Pakem (CLAUDE.md §7): @media WAJIB pakai nilai breakpoint baku dari
 * token --bp-* di tokens.css. Sebelumnya 20+ nilai liar tersebar di
 * codebase. Script ini meng-enforce itu di CI (npm run check).
 *
 * Strategi BASELINE (cara standar memperkenalkan linter ke codebase
 * yang sudah kotor): kita SNAPSHOT semua violation yang ada sekarang ke
 * breakpoint-baseline.json sebagai "utang yang di-grandfather". Build
 * tetap hijau untuk violation lama, TAPI gagal kalau ada nilai liar BARU
 * (atau jumlah satu nilai bertambah). Utang dibayar bertahap — tiap
 * migrasi breakpoint, jalankan --update-baseline supaya angkanya turun.
 *
 * Nilai diizinkan tanpa baseline:
 *   640, 1024, 1280, 1536, 1920  → token --bp-* (sm/md/lg/xl/2xl)
 *   768                          → floor tablet portrait (CLAUDE.md §7),
 *                                  bukan token tapi sah secara pakem.
 *
 * Pengecualian per-baris: tulis komentar `bp-allow` di baris @media
 * (atau baris tepat di atasnya) untuk menandai breakpoint yang memang
 * disengaja & justified. Contoh:
 *   @media (max-width: 880px) { ... }  // bp-allow: grid kartu reflow
 *
 * Penggunaan:
 *   node scripts/audit-breakpoints.mjs            → enforce vs baseline (CI)
 *   node scripts/audit-breakpoints.mjs --list     → daftar semua violation + lokasi
 *   node scripts/audit-breakpoints.mjs --update-baseline → tulis ulang baseline
 * ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const stylesDir = join(root, 'resources/js/styles')
const baselinePath = join(root, 'scripts/breakpoint-baseline.json')

const ALLOWED = new Set([640, 768, 1024, 1280, 1536, 1920])
const MEDIA_RE = /@media[^{]*?\((?:max|min)-width:\s*(\d+)px/g
const ALLOW_TAG = /bp-allow/

const args = new Set(process.argv.slice(2))
const mode = args.has('--update-baseline') ? 'update'
  : args.has('--list') ? 'list'
  : 'enforce'

// ── Scan ──────────────────────────────────────────────────────────────
const violations = [] // { file, line, value, text }
for (const name of readdirSync(stylesDir)) {
  if (!name.endsWith('.css')) continue
  const file = join(stylesDir, name)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    MEDIA_RE.lastIndex = 0
    let m
    while ((m = MEDIA_RE.exec(line)) !== null) {
      const value = Number(m[1])
      if (ALLOWED.has(value)) continue
      // per-line opt-out: bp-allow di baris ini atau baris sebelumnya
      const allowed = ALLOW_TAG.test(line) || (i > 0 && ALLOW_TAG.test(lines[i - 1]))
      if (allowed) continue
      violations.push({ file: relative(root, file), line: i + 1, value, text: line.trim() })
    }
  }
}

// ── Agregasi per nilai ──────────────────────────────────────────────────
const counts = {}
for (const v of violations) counts[v.value] = (counts[v.value] ?? 0) + 1

// ── Mode: list ──────────────────────────────────────────────────────────
if (mode === 'list') {
  if (violations.length === 0) {
    console.log('✓ Tidak ada breakpoint liar. Semua @media pakai nilai baku.')
    process.exit(0)
  }
  console.log(`Breakpoint liar (${violations.length} total, ${Object.keys(counts).length} nilai unik):\n`)
  const byValue = [...violations].sort((a, b) => a.value - b.value || a.file.localeCompare(b.file))
  for (const v of byValue) {
    console.log(`  ${v.value}px  ${v.file}:${v.line}`)
  }
  console.log('\nRingkasan per nilai:')
  for (const [val, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}×  ${val}px`)
  }
  process.exit(0)
}

// ── Mode: update-baseline ────────────────────────────────────────────────
if (mode === 'update') {
  const baseline = {}
  for (const val of Object.keys(counts).sort((a, b) => Number(a) - Number(b))) {
    baseline[val] = counts[val]
  }
  const payload = {
    _comment: 'Utang breakpoint liar yang di-grandfather. Turunkan angka ini saat migrasi. Regenerate: node scripts/audit-breakpoints.mjs --update-baseline',
    _allowed: [...ALLOWED].sort((a, b) => a - b),
    counts: baseline,
  }
  writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n')
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(`✓ Baseline ditulis: ${total} violation (${Object.keys(counts).length} nilai unik) → scripts/breakpoint-baseline.json`)
  process.exit(0)
}

// ── Mode: enforce (default, untuk CI) ─────────────────────────────────────
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')).counts ?? {})
  : {}

const regressions = [] // nilai yang melebihi baseline / baru
for (const [val, n] of Object.entries(counts)) {
  const allowed = baseline[val] ?? 0
  if (n > allowed) regressions.push({ value: val, count: n, baseline: allowed })
}

// Info: baseline yang sudah bisa diketatkan (violation berkurang)
const improvable = []
for (const [val, allowed] of Object.entries(baseline)) {
  const now = counts[val] ?? 0
  if (now < allowed) improvable.push({ value: val, now, baseline: allowed })
}

if (regressions.length > 0) {
  console.error('✗ Breakpoint liar BARU terdeteksi (di luar nilai baku & melebihi baseline):\n')
  for (const r of regressions) {
    console.error(`  ${r.value}px — ${r.count}× sekarang, baseline ${r.baseline}×`)
    for (const v of violations.filter(v => String(v.value) === String(r.value)).slice(0, 8)) {
      console.error(`      ${v.file}:${v.line}`)
    }
  }
  console.error('\nPakem: pakai nilai baku 640/1024/1280/1536/1920 (atau 768 floor tablet).')
  console.error('Kalau breakpoint ini memang disengaja, tandai dengan komentar `bp-allow` di baris @media.')
  console.error('Detail semua violation: node scripts/audit-breakpoints.mjs --list')
  process.exit(1)
}

if (improvable.length > 0) {
  console.log('✓ Tidak ada breakpoint liar baru.')
  console.log('  Baseline bisa diketatkan (violation berkurang) — jalankan --update-baseline:')
  for (const i of improvable) console.log(`    ${i.value}px: ${i.now}× (baseline ${i.baseline}×)`)
} else {
  console.log(`✓ Tidak ada breakpoint liar baru. (${violations.length} violation di-grandfather via baseline)`)
}
process.exit(0)
