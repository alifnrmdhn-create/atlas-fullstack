#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════
 * audit-darkmode — guardrail dark-mode "anti-bolong" ATLAS
 * ════════════════════════════════════════════════════════════════════
 * Masalah: dark mode di ATLAS dibangun lewat token yang di-override di
 * blok [data-theme="dark"]. "Bolong" muncul saat sebuah warna DI-HARDCODE
 * (hex/rgb/named) di tempat yang tidak ikut theme:
 *
 *   (A) Inline style di .tsx — `style={{ color:'#1e293b' }}` / fill="#fff".
 *       Inline style mem-BYPASS [data-theme], jadi nilai light nyangkut
 *       di dark mode. Ini kelas bolong paling sering & paling kelihatan.
 *   (B) Literal warna di .css pada properti theme-sensitive (background/
 *       color/border/box-shadow/fill/stroke/outline) yang DI LUAR blok
 *       [data-theme] dan BUKAN nilai netral (transparent/currentColor).
 *       Seharusnya pakai token var(--ds-...) / var(--color-...) supaya ikut theme.
 *
 * Strategi BASELINE (identik dengan audit-breakpoints): snapshot semua
 * violation yang ADA sekarang ke darkmode-baseline.json sebagai "utang
 * yang di-grandfather". Build tetap hijau untuk utang lama, TAPI GAGAL
 * kalau ada hardcode warna BARU (atau jumlahnya bertambah). Utang dibayar
 * bertahap — tiap migrasi, jalankan --update-baseline supaya angkanya turun
 * sampai 0.
 *
 * Nilai/konteks yang TIDAK dihitung violation:
 *   - var(--...) apa pun (sudah token-driven, ikut theme).
 *   - transparent / currentColor / inherit / none / unset / initial.
 *   - Apa pun di dalam selector [data-theme="..."] (memang override theme).
 *   - File definisi token (tokens.css) — di situ literal memang sumbernya.
 *   - rgba(...,0) full-transparent.
 *
 * Pengecualian per-baris: tulis komentar `dark-allow` di baris itu (atau
 * baris tepat di atasnya). Pakai untuk warna brand/data-viz yang memang
 * sengaja sama di kedua theme (mis. warna status merah/hijau semantik).
 *   background: #16a34a;   // dark-allow: warna status On Track, sama di dua theme
 *
 * Penggunaan:
 *   node scripts/audit-darkmode.mjs               → enforce vs baseline (CI)
 *   node scripts/audit-darkmode.mjs --list        → daftar semua violation
 *   node scripts/audit-darkmode.mjs --list=css    → filter kategori (css|tsx)
 *   node scripts/audit-darkmode.mjs --update-baseline → tulis ulang baseline
 * ════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const root = process.cwd()
const baselinePath = join(root, 'scripts/darkmode-baseline.json')

const args = new Set(process.argv.slice(2))
const listArg = [...args].find(a => a.startsWith('--list'))
const mode = args.has('--update-baseline') ? 'update'
  : listArg ? 'list'
  : 'enforce'
const listFilter = listArg && listArg.includes('=') ? listArg.split('=')[1] : null

const ALLOW_TAG = /dark-allow/

// ── Token yang terdefinisi (untuk deteksi fallback bocor) ──────────────
// var(--X, #lightcolor) AMAN kalau --X terdefinisi (& dark-aware). Kalau --X
// TIDAK terdefinisi di mana pun, fallback light dipakai di KEDUA theme → putih
// di dark. Kumpulkan semua nama token yang didefinisikan di tokens.css.
const DEFINED_TOKENS = new Set()
for (const tf of ['resources/js/styles/tokens.css', 'resources/js/design-system/tokens.css']) {
  const p = join(root, tf)
  if (!existsSync(p)) continue
  for (const m of readFileSync(p, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/gi)) DEFINED_TOKENS.add(m[1])
}
// Fallback dianggap "light leak" kalau berupa literal warna terang (bukan var/angka/keyword).
const LIGHT_FALLBACK = /#(f[0-9a-f]{2}|e[0-9a-f]{2}|d[0-9a-f]{2}|c[0-9a-f]{2}|fff|eee|ddd|ccc)[0-9a-f]*\b|\bwhite\b|rgba?\(\s*2[0-5][0-9]/i
const VAR_FALLBACK_RE = /var\(\s*(--[a-z0-9-]+)\s*,\s*([^(),]+(?:\([^)]*\))?[^()]*)\)/gi

// File CSS yang mendefinisikan token — literal di sini memang sumber warna.
const TOKEN_FILES = new Set(['tokens.css'])

// Properti CSS yang theme-sensitive (kalau hardcoded → bolong di dark).
const COLOR_PROPS = /(^|[;{]|\s)(background|background-color|color|border|border-top|border-bottom|border-left|border-right|border-color|box-shadow|fill|stroke|outline|outline-color|caret-color|text-decoration-color|column-rule-color)\s*:/i

// Nilai yang aman walau bukan var().
const SAFE_VALUE = /\b(transparent|currentColor|inherit|none|unset|initial|currentcolor)\b/i
// Deteksi literal warna kuat: #hex, rgb/rgba(...), hsl/hsla(...).
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/

// ── Pengumpul file ────────────────────────────────────────────────────
function walk(dir, exts, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, acc)
    else if (exts.has(extname(name))) acc.push(full)
  }
  return acc
}

const violations = [] // { file, line, category, text }

// ── Scan CSS (kategori B) ─────────────────────────────────────────────
// Pakai brace-depth tracking: kalau selector mengandung [data-theme=...]
// maka seluruh blok itu adalah override theme → skip.
const cssFiles = [
  ...walk(join(root, 'resources/js/styles'), new Set(['.css'])),
  ...walk(join(root, 'resources/js/design-system'), new Set(['.css'])),
  ...walk(join(root, 'resources/js/Pages'), new Set(['.css'])),
  ...walk(join(root, 'resources/js/components'), new Set(['.css'])),
]

for (const file of cssFiles) {
  const base = file.split('/').pop()
  if (TOKEN_FILES.has(base)) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')

  // Lacak stack selector untuk tahu apakah kita di dalam [data-theme].
  // Sederhana: hitung apakah konteks blok terkini mengandung data-theme.
  const themeStack = [] // boolean per level brace
  let pendingSelector = ''
  let inComment = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // strip block comment kasar
    if (inComment) {
      const end = line.indexOf('*/')
      if (end === -1) continue
      line = line.slice(end + 2)
      inComment = false
    }
    let cstart = line.indexOf('/*')
    while (cstart !== -1) {
      const cend = line.indexOf('*/', cstart + 2)
      if (cend === -1) { inComment = true; line = line.slice(0, cstart); break }
      line = line.slice(0, cstart) + line.slice(cend + 2)
      cstart = line.indexOf('/*')
    }

    // proses brace per karakter agar selector & nesting akurat
    let buf = ''
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      if (ch === '{') {
        const sel = (pendingSelector + buf).trim()
        const isTheme = /\[data-theme/.test(sel)
        const parentTheme = themeStack.length ? themeStack[themeStack.length - 1] : false
        themeStack.push(isTheme || parentTheme)
        pendingSelector = ''
        buf = ''
      } else if (ch === '}') {
        themeStack.pop()
        pendingSelector = ''
        buf = ''
      } else if (ch === ';') {
        // satu deklarasi selesai pada buf
        evalDecl(buf, file, i, lines[i])
        buf = ''
      } else {
        buf += ch
      }
    }
    pendingSelector += buf + '\n'
    // (deklarasi tanpa ; di akhir baris ditangani saat ketemu } atau ;)
  }

  function evalDecl(decl, file, lineIdx, rawLine) {
    const inTheme = themeStack.length ? themeStack[themeStack.length - 1] : false
    if (inTheme) return
    if (!COLOR_PROPS.test(decl)) return
    const valuePart = decl.slice(decl.indexOf(':') + 1)
    if (!COLOR_LITERAL.test(valuePart)) return
    // Nilai yang SUDAH menyentuh token (var(...)) di-skip: ini mencakup
    //  (a) fallback `var(--token, #fff)` — warna asli dari token, ikut theme,
    //  (b) `color-mix(in srgb, #EF4444 11%, var(--surface))` — tint di atas
    //      basis token, sudah theme-adaptive,
    //  (c) `box-shadow: var(--card-shadow), inset 0 0 0 #10B981` — aksen.
    // Yang tersisa = literal warna MURNI tanpa token sama sekali = bolong asli.
    if (/var\(\s*--/.test(valuePart)) return
    if (SAFE_VALUE.test(valuePart) && !COLOR_LITERAL.test(valuePart.replace(SAFE_VALUE, ''))) return
    // abaikan rgba full-transparent (…,0) — netral kedua theme
    const onlyTransparentRgba = /^[^#]*rgba?\([^)]*,\s*0\s*\)\s*$/.test(valuePart.trim()) && !/#/.test(valuePart)
    if (onlyTransparentRgba) return
    if (ALLOW_TAG.test(rawLine) || (lineIdx > 0 && ALLOW_TAG.test(lines[lineIdx - 1]))) return
    violations.push({ file: relative(root, file), line: lineIdx + 1, category: 'css', text: decl.trim().slice(0, 100) })
  }
}

// ── Scan TSX (kategori A) — inline style hardcoded ─────────────────────
const tsxFiles = [
  ...walk(join(root, 'resources/js/Pages'), new Set(['.tsx'])),
  ...walk(join(root, 'resources/js/components'), new Set(['.tsx'])),
  ...walk(join(root, 'resources/js/design-system'), new Set(['.tsx'])),
  ...walk(join(root, 'resources/js/layouts'), new Set(['.tsx'])),
]

// properti warna di objek style / atribut SVG
const TSX_COLOR_KEY = /\b(color|background|backgroundColor|borderColor|border|outline|outlineColor|fill|stroke|boxShadow|caretColor|textDecorationColor|stopColor|floodColor)\s*[:=]\s*/

for (const file of tsxFiles) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // cari key warna diikuti string literal warna (hex/rgb/hsl)
    TSX_COLOR_KEY.lastIndex = 0
    let m
    const re = new RegExp(TSX_COLOR_KEY.source, 'gi')
    while ((m = re.exec(line)) !== null) {
      const after = line.slice(m.index + m[0].length, m.index + m[0].length + 80)
      // hanya tangkap literal warna (bukan var()/token/variable JS)
      const litMatch = after.match(/^\s*['"`]\s*(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|white|black)\s*['"`]/)
        || after.match(/^\s*(#[0-9a-fA-F]{3,8}\b)/) // SVG attr fill=#...
      if (!litMatch) continue
      if (ALLOW_TAG.test(line) || (i > 0 && ALLOW_TAG.test(lines[i - 1]))) continue
      violations.push({ file: relative(root, file), line: i + 1, category: 'tsx', text: (m[0] + litMatch[0]).trim().slice(0, 100) })
    }
  }
}

// ── Scan fallback-bocor (kategori C) — var(--undefined, #lightcolor) ──────
// Ini blind-spot yang dulu meloloskan .wb-prog__lane putih di /execution.
for (const file of [...cssFiles, ...tsxFiles]) {
  const base = file.split('/').pop()
  if (TOKEN_FILES.has(base)) continue
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    VAR_FALLBACK_RE.lastIndex = 0
    let m
    while ((m = VAR_FALLBACK_RE.exec(line)) !== null) {
      const tok = m[1], fb = m[2].trim()
      if (DEFINED_TOKENS.has(tok)) continue       // token ada → fallback tak terpakai
      if (/var\(/.test(fb)) continue              // fallback rujuk token lain → ditangani terpisah
      if (!LIGHT_FALLBACK.test(fb)) continue       // fallback bukan warna terang (angka/keyword/dark) → bukan leak
      if (ALLOW_TAG.test(line) || (i > 0 && ALLOW_TAG.test(lines[i - 1]))) continue
      violations.push({ file: relative(root, file), line: i + 1, category: 'leak', text: `var(${tok}, ${fb})` })
    }
  }
}

// ── Agregasi ──────────────────────────────────────────────────────────
function aggregate(vs) {
  const byFile = {}
  for (const v of vs) byFile[v.file] = (byFile[v.file] ?? 0) + 1
  return byFile
}
const counts = aggregate(violations)
const catCount = {
  css: violations.filter(v => v.category === 'css').length,
  tsx: violations.filter(v => v.category === 'tsx').length,
  leak: violations.filter(v => v.category === 'leak').length,
}

// ── Mode: list ────────────────────────────────────────────────────────
if (mode === 'list') {
  let vs = violations
  if (listFilter) vs = vs.filter(v => v.category === listFilter)
  if (vs.length === 0) { console.log('✓ Tidak ada warna hardcoded (anti-theme) terdeteksi.'); process.exit(0) }
  console.log(`Warna hardcoded (anti dark-mode): ${vs.length} total — css ${catCount.css}, tsx ${catCount.tsx}, leak ${catCount.leak}\n`)
  let curFile = ''
  for (const v of vs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (v.file !== curFile) { console.log(`\n  ${v.file}`); curFile = v.file }
    console.log(`    :${v.line}  [${v.category}]  ${v.text}`)
  }
  console.log('\nRingkasan per file:')
  for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}×  ${f}`)
  }
  process.exit(0)
}

// ── Mode: update-baseline ─────────────────────────────────────────────
if (mode === 'update') {
  const baseline = {}
  for (const f of Object.keys(counts).sort()) baseline[f] = counts[f]
  const payload = {
    _comment: 'Utang warna hardcoded (anti dark-mode) yang di-grandfather, per file. Turunkan saat migrasi sampai 0. Regenerate: node scripts/audit-darkmode.mjs --update-baseline',
    _totals: { css: catCount.css, tsx: catCount.tsx, leak: catCount.leak, all: violations.length },
    counts: baseline,
  }
  writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + '\n')
  console.log(`✓ Baseline ditulis: ${violations.length} violation (css ${catCount.css}, tsx ${catCount.tsx}, leak ${catCount.leak}) → scripts/darkmode-baseline.json`)
  process.exit(0)
}

// ── Mode: enforce (CI) ────────────────────────────────────────────────
const baseline = existsSync(baselinePath)
  ? (JSON.parse(readFileSync(baselinePath, 'utf8')).counts ?? {})
  : {}

const regressions = []
for (const [f, n] of Object.entries(counts)) {
  const allowed = baseline[f] ?? 0
  if (n > allowed) regressions.push({ file: f, count: n, baseline: allowed })
}
const improvable = []
for (const [f, allowed] of Object.entries(baseline)) {
  const now = counts[f] ?? 0
  if (now < allowed) improvable.push({ file: f, now, baseline: allowed })
}

if (regressions.length > 0) {
  console.error('✗ Warna hardcoded BARU terdeteksi (anti dark-mode, melebihi baseline):\n')
  for (const r of regressions) {
    console.error(`  ${r.file} — ${r.count}× sekarang, baseline ${r.baseline}×`)
    for (const v of violations.filter(v => v.file === r.file).slice(0, 6)) {
      console.error(`      :${v.line}  [${v.category}]  ${v.text}`)
    }
  }
  console.error('\nPakem: warna theme-sensitive WAJIB pakai token (var(--ds-*) / var(--color-*)) supaya ikut swap dark/light.')
  console.error('Kalau warna ini memang brand/semantik (sama di dua theme), tandai `dark-allow` di baris itu.')
  console.error('Detail: node scripts/audit-darkmode.mjs --list')
  process.exit(1)
}

if (improvable.length > 0) {
  console.log('✓ Tidak ada warna hardcoded baru.')
  console.log('  Baseline bisa diketatkan (violation berkurang) — jalankan --update-baseline:')
  for (const i of improvable.slice(0, 20)) console.log(`    ${i.file}: ${i.now}× (baseline ${i.baseline}×)`)
} else {
  console.log(`✓ Tidak ada warna hardcoded baru. (${violations.length} di-grandfather: css ${catCount.css}, tsx ${catCount.tsx}, leak ${catCount.leak})`)
}
process.exit(0)
