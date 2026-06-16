// Load-test harness ATLAS (scale-readiness S0.3) — zero-install, berbasis Node.
//
// Mengukur p50/p95/p99 latency, throughput (RPS), dan error-rate untuk jalur
// baca terpanas + poll realtime, di bawah konkurensi yang bisa diatur. Login
// sekali (cookie session di-reuse) lalu N "virtual user" menembak campuran
// endpoint berbobot selama DURATION detik.
//
// Pakai:
//   APP_URL=http://localhost:9000 VUS=20 DURATION=20 node scripts/load/load-test.mjs
//   APP_URL=https://atlas-ptpn.up.railway.app VUS=5 DURATION=15 node scripts/load/load-test.mjs   # gentle prod probe
//
// CATATAN baseline: `php artisan serve` lokal SINGLE-THREAD — angka absolut
// tak representatif untuk prod FrankenPHP (num_cpu*2 thread). Pakai lokal untuk
// perbandingan before/after; baseline kapasitas absolut = run di prod/staging
// (S4.2). JANGAN hammer prod: VUS rendah + DURATION pendek = setara beban
// segelintir user, aman; konkurensi tinggi ke prod = bisa ganggu user nyata.
//
// Env: SMOKE_LOGIN_ID (default bod_kmr@ptpn), SMOKE_LOGIN_PASSWORD (Password123!)

const baseUrl = (process.env.APP_URL ?? 'http://localhost:9000').replace(/\/$/, '')
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const VUS = parseInt(process.env.VUS ?? '20', 10)
const DURATION = parseInt(process.env.DURATION ?? '20', 10) * 1000

// Campuran beban realistis (bobot = frekuensi relatif). Poll dominan karena
// tiap tab aktif memanggilnya tiap 2 detik; baca halaman lebih jarang.
const SCENARIOS = [
  { name: 'GET /realtime/poll', method: 'GET', path: '/realtime/poll?since=0', weight: 40 },
  { name: 'GET /', method: 'GET', path: '/', weight: 8 },
  { name: 'GET /workspace/overview', method: 'GET', path: '/workspace/overview', weight: 8 },
  { name: 'GET /tasks', method: 'GET', path: '/tasks', weight: 10 },
  { name: 'GET /channels', method: 'GET', path: '/channels', weight: 8 },
  { name: 'GET /programs', method: 'GET', path: '/programs', weight: 6 },
  { name: 'GET /organization/program-summary', method: 'GET', path: '/organization/program-summary', weight: 5 },
  { name: 'GET /my-work', method: 'GET', path: '/my-work', weight: 5 },
  { name: 'GET /notifications', method: 'GET', path: '/notifications?read=all', weight: 5 },
  { name: 'GET /apms/kpi', method: 'GET', path: '/apms/kpi', weight: 5 },
]

// ── Cookie jar minimal ──────────────────────────────────────────────────────
const jar = new Map()
function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? []
  for (const c of raw) {
    const [pair] = c.split(';')
    const idx = pair.indexOf('=')
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}
function xsrf() {
  const t = jar.get('XSRF-TOKEN')
  return t ? decodeURIComponent(t) : null
}

async function req(method, path, { body } = {}) {
  const headers = {
    'Accept': method === 'GET' && !path.startsWith('/realtime') ? 'application/json' : 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': cookieHeader(),
  }
  if (body) { headers['Content-Type'] = 'application/json'; const t = xsrf(); if (t) headers['X-XSRF-TOKEN'] = t }
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body, redirect: 'manual' })
  storeCookies(res)
  return res
}

async function login() {
  // 1. GET /login → set session + XSRF cookie
  const g = await fetch(`${baseUrl}/login`, { headers: { 'Cookie': cookieHeader() }, redirect: 'manual' })
  storeCookies(g)
  // 2. POST /login (web form, butuh X-XSRF-TOKEN)
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrf() ?? '',
      'Cookie': cookieHeader(),
    },
    body: JSON.stringify({ identifier: loginId, password: loginPassword }),
    redirect: 'manual',
  })
  storeCookies(res)
  if (res.status >= 400) {
    throw new Error(`Login gagal: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`)
  }
  // verifikasi sesi aktif
  const check = await req('GET', '/notifications?read=all')
  if (check.status !== 200) throw new Error(`Sesi tidak aktif pasca-login: /notifications → ${check.status}`)
}

// weighted picker
const pool = SCENARIOS.flatMap((s) => Array(s.weight).fill(s))
function pick() { return pool[Math.floor(Math.random() * pool.length)] }

const stats = new Map(SCENARIOS.map((s) => [s.name, { lat: [], ok: 0, err: 0 }]))

async function virtualUser(deadline) {
  while (performance.now() < deadline) {
    const s = pick()
    const t0 = performance.now()
    try {
      const res = await req(s.method, s.path, s.body ? { body: s.body } : {})
      const dt = performance.now() - t0
      const rec = stats.get(s.name)
      rec.lat.push(dt)
      // 2xx/3xx = sukses (poll bisa 204; redirect manual untuk page = 200/302)
      if (res.status < 400) rec.ok++; else rec.err++
    } catch {
      stats.get(s.name).err++
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

async function main() {
  console.log(`→ ATLAS load test | ${baseUrl} | ${VUS} VUs × ${DURATION / 1000}s`)
  console.log(`→ login sebagai ${loginId} ...`)
  await login()
  console.log('→ login OK, mulai beban ...\n')

  const start = performance.now()
  const deadline = start + DURATION
  await Promise.all(Array.from({ length: VUS }, () => virtualUser(deadline)))
  const elapsed = (performance.now() - start) / 1000

  let totalReq = 0, totalErr = 0, allLat = []
  console.log('Endpoint                              reqs   err   p50    p95    p99    max   (ms)')
  console.log('─'.repeat(86))
  for (const s of SCENARIOS) {
    const r = stats.get(s.name)
    const reqs = r.ok + r.err
    totalReq += reqs; totalErr += r.err; allLat = allLat.concat(r.lat)
    console.log(
      `${s.name.padEnd(36)} ${String(reqs).padStart(6)} ${String(r.err).padStart(5)} ` +
      `${String(Math.round(pct(r.lat, 50))).padStart(5)} ${String(Math.round(pct(r.lat, 95))).padStart(6)} ` +
      `${String(Math.round(pct(r.lat, 99))).padStart(6)} ${String(Math.round(Math.max(0, ...r.lat))).padStart(6)}`,
    )
  }
  console.log('─'.repeat(86))
  const rps = totalReq / elapsed
  const errRate = totalReq ? (totalErr / totalReq) * 100 : 0
  console.log(`TOTAL: ${totalReq} reqs | ${rps.toFixed(1)} RPS | err ${errRate.toFixed(2)}% | ` +
    `p50 ${Math.round(pct(allLat, 50))}ms p95 ${Math.round(pct(allLat, 95))}ms p99 ${Math.round(pct(allLat, 99))}ms`)
  if (errRate > 1) { console.error(`\n⚠ error-rate ${errRate.toFixed(2)}% > 1% — investigasi sebelum naikkan beban.`); process.exitCode = 1 }
}

main().catch((e) => { console.error('LOAD TEST ERROR:', e.message); process.exitCode = 1 })
