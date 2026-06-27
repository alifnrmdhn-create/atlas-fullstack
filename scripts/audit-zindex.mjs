#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
 * audit-zindex — guardrail layering overlay ATLAS
 * ════════════════════════════════════════════════════════════════════
 * Pakem: z-index yang ikut LAYERING GLOBAL (overlay/modal/topbar/drawer)
 * WAJIB pakai token --z-* dari tokens.css (--z-sidebar 100, --z-tabbar 150,
 * --z-modal-backdrop 9000, --z-modal 9001, --z-topbar 9500). Angka mentah
 * tinggi = "karang nilai untuk mengalahkan sesuatu" → tabrakan stacking yang
 * cuma ketahuan dengan mata. Bug nyata (Jun 2026): SidePanel `z-index: 61`
 * meluncur di belakang topbar (--z-topbar 9500) → header panel ke-clip.
 *
 * Hanya literal ≥ THRESHOLD yang di-flag: stacking LOKAL kecil (0..19, mis.
 * pseudo-element di atas sibling-nya) sah & tak perlu token. Yang berbahaya
 * adalah tier overlay (20+) yang bypass skala --z-*.
 *
 * Strategi BASELINE (sama dgn audit-breakpoints): snapshot violation yang ADA
 * sekarang ke zindex-baseline.json sebagai utang grandfather. Build tetap hijau
 * untuk yang lama, TAPI gagal kalau ada literal tinggi BARU (atau jumlah satu
 * nilai bertambah). Bayar bertahap: tiap migrasi overlay ke token, jalankan
 * --update-baseline supaya angkanya turun.
 *
 * Pengecualian per-baris: komentar `z-allow` di baris z-index (atau baris tepat
 * di atasnya). Contoh:
 *   z-index: 2147483647;  // z-allow: portal pihak-ketiga harus paling atas
 *
 * Penggunaan:
 *   node scripts/audit-zindex.mjs                   → enforce vs baseline (CI)
 *   node scripts/audit-zindex.mjs --list            → daftar semua violation
 *   node scripts/audit-zindex.mjs --update-baseline → tulis ulang baseline
 * ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const scanRoots = [
  join(root, 'resources/js/styles'),
  join(root, 'resources/js/design-system'),
]
const baselinePath = join(root, 'scripts/zindex-baseline.json')

// Ambang: literal dgn |nilai| >= 20 ikut tier overlay → wajib token --z-*.
// 0..19 = stacking lokal, dibebaskan.
const THRESHOLD = 20
// Tangkap `z-index: 61` / `z-index:9999 !important` — TAPI bukan `var(--z-...)`.
const ZINDEX_RE = /z-index:\s*(-?\d+)\b/g
const ALLOW_TAG = /z-allow/

const args = new Set(process.argv.slice(2))
const mode = args.has('--update-baseline') ? 'update'
  : args.has('--list') ? 'list'
  : 'enforce'

// ── Kumpulkan semua .css (rekursif) ───────────────────────────────────────
function collectCss(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...collectCss(full))
    else if (name.endsWith('.css')) out.push(full)
  }
  return out
}

// ── Scan ──────────────────────────────────────────────────────────────────
const violations = [] // { file, line, value, text }
for (const file of scanRoots.flatMap(collectCss)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    ZINDEX_RE.lastIndex = 0
    let m
    while ((m = ZINDEX_RE.exec(line)) !== null) {
      const value = Number(m[1])
      if (Math.abs(value) < THRESHOLD) continue // stacking lokal — abaikan
      const allowed = ALLOW_TAG.test(line) || (i > 0 && ALLOW_TAG.test(lines[i - 1]))
      if (allowed) continue
      violations.push({ file: relative(root, file), line: i + 1, value, text: line.trim() })
    }
  }
}

// ── Agregasi per nilai ──────────────────────────────────────────────────────
const counts = {}
for (const v of violations) counts[v.value] = (counts[v.value] ?? 0) + 1

// ── Mode: list ──────────────────────────────────────────────────────────────
if (mode === 'list') {
  if (violations.length === 0) {
    console.log('✓ Tidak ada z-index literal tier-overlay. Semua pakai token --z-*.')
    process.exit(0)
  }
  console.log(`z-index literal ≥${THRESHOLD} (${violations.length} total, ${Object.keys(counts).length} nilai unik):\n`)
  const byValue = [...violations].sort((a, b) => a.value - b.value || a.file.localeCompare(b.file))
  for (const v of byValue) console.log(`  ${String(v.value).padStart(6)}  ${v.file}:${v.line}`)
  console.log('\nRingkasan per nilai:')
  for (const [val, n] of Object.entries(counts).sort((a, b) => Number(a) - Number(b))) {
    console.log(`  ${String(n).padStart(3)}×  ${val}`)
  }
  process.exit(0)
}

// ── Mode: update-baseline ────────────────────────────────────────────────────
if (mode === 'update') {
  const baseline = {}
  for (const val of Object.keys(counts).sort((a, b) => Number(a) - Number(b))) baseline[val] = counts[val]
  const payload = {
    _comment: 'Utang z-index literal tier-overlay (≥20) yang di-grandfather. Turunkan saat migrasi ke token --z-*. Regenerate: node scripts/audit-zindex.mjs --update-baseline',
    _threshold: THRESHOLD,
    counts: baseline,
  }
  writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n')
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(`✓ Baseline ditulis: ${total} violation (${Object.keys(counts).length} nilai unik) → scripts/zindex-baseline.json`)
  process.exit(0)
}

// ── Mode: enforce (default, untuk CI) ─────────────────────────────────────────
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')).counts ?? {})
  : {}

const regressions = []
for (const [val, n] of Object.entries(counts)) {
  const allowed = baseline[val] ?? 0
  if (n > allowed) regressions.push({ value: val, count: n, baseline: allowed })
}

const improvable = []
for (const [val, allowed] of Object.entries(baseline)) {
  const now = counts[val] ?? 0
  if (now < allowed) improvable.push({ value: val, now, baseline: allowed })
}

if (regressions.length > 0) {
  console.error(`✗ z-index literal tier-overlay BARU terdeteksi (≥${THRESHOLD}, melebihi baseline):\n`)
  for (const r of regressions) {
    console.error(`  ${r.value} — ${r.count}× sekarang, baseline ${r.baseline}×`)
    for (const v of violations.filter(v => String(v.value) === String(r.value)).slice(0, 8)) {
      console.error(`      ${v.file}:${v.line}`)
    }
  }
  console.error('\nPakem: overlay/modal/drawer/topbar WAJIB pakai token --z-* (tokens.css):')
  console.error('  --z-sidebar 100 · --z-tabbar 150 · --z-modal-backdrop 9000 · --z-modal 9001 · --z-topbar 9500')
  console.error('Kalau literal ini memang disengaja (mis. portal pihak-ketiga), tandai komentar `z-allow`.')
  console.error('Detail semua violation: node scripts/audit-zindex.mjs --list')
  process.exit(1)
}

if (improvable.length > 0) {
  console.log('✓ Tidak ada z-index literal tier-overlay baru.')
  console.log('  Baseline bisa diketatkan (violation berkurang) — jalankan --update-baseline:')
  for (const i of improvable) console.log(`    ${i.value}: ${i.now}× (baseline ${i.baseline}×)`)
} else {
  console.log(`✓ Tidak ada z-index literal tier-overlay baru. (${violations.length} di-grandfather via baseline)`)
}
process.exit(0)
