// Mobile audit (Jun 2026): kunjungi SEMUA halaman utama+detail di 390px,
// ukur overflow horizontal halaman & per-elemen, tap target <44px, lalu
// tangkap screenshot tiap halaman untuk inspeksi visual.
// Jalankan: node scripts/mobile-audit.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-mobile-audit'
mkdirSync(OUT, { recursive: true })

const VW = 390
// daftar halaman: [slug-file, path, label, optional wait-selector]
const PAGES = [
  ['01-home', '/', 'Home'],
  ['02-focus', '/fokus', 'Focus'],
  ['03-programs', '/programs', 'Programs list'],
  ['04-program-detail', '/programs/156', 'Program detail'],
  ['05-program-charter', '/programs/156/charter', 'Program Charter'],
  ['06-workboard', '/execution', 'Workboard'],
  ['07-task-detail', '/execution/tasks/856', 'Task detail'],
  ['08-assignment', '/penugasan', 'Assignment'],
  ['09-coordination', '/jadwal', 'Coordination/Schedule'],
  ['10-meeting-detail', '/meetings/64', 'Meeting detail'],
  ['11-channels', '/channels', 'Channels'],
  ['12-channel-open', '/channels/4', 'Channel open'],
  ['13-presence', '/presence', 'Presence'],
  ['14-monthly-reports', '/laporan-bulanan', 'Monthly reports'],
  ['15-monthly-detail', '/laporan-bulanan/64', 'Monthly report detail'],
  ['16-scorecard', '/performance/scorecard', 'Perf Scorecard'],
  ['17-divisi', '/performance/divisi', 'Perf Divisi'],
  ['18-kolegial', '/performance/kolegial', 'Perf Kolegial'],
  ['19-me', '/performance/me', 'Perf Me'],
  ['20-settings', '/settings', 'Settings'],
  ['21-profile', '/profile', 'Profile'],
  ['22-notifications', '/notifications', 'Notifications'],
  ['23-admin-users', '/admin/users', 'Admin Users'],
  ['24-admin-orgs', '/admin/orgs', 'Admin Orgs'],
  ['25-panduan', '/panduan', 'Panduan/Playbook'],
]

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', `--window-size=${VW},844`, '--force-device-scale-factor=2',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
const report = []

try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: 844, deviceScaleFactor: 2, mobile: true })

  step('login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  for (const [slug, path, label] of PAGES) {
    step(`${label}  (${path})`)
    try {
      await navigate(page, `${baseUrl}${path}`)
      await sleep(1400)
      const m = await measure(page, VW)
      await capture(page, slug)
      report.push({ slug, path, label, ...m })
      const flag = m.pageOverflow > 1 ? `⚠ OVERFLOW +${m.pageOverflow}px` : 'ok'
      console.log(`   docW=${m.docW} vw=${m.vw} ${flag}  offenders=${m.offenders.length}  tinyTaps=${m.tinyTaps}`)
      if (m.offenders.length) m.offenders.slice(0, 6).forEach((o) => console.log(`      → ${o}`))
    } catch (err) {
      console.log(`   FAILED: ${err.message}`)
      report.push({ slug, path, label, error: err.message })
    }
  }

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log('\n=== SUMMARY ===')
  const overflowed = report.filter((r) => r.pageOverflow > 1)
  console.log(`Pages with horizontal overflow: ${overflowed.length}/${report.length}`)
  overflowed.forEach((r) => console.log(` ⚠ ${r.label} (${r.path}): +${r.pageOverflow}px`))
  console.log(`\nScreenshots + report.json in ${OUT}`)
} catch (err) {
  console.error('[audit] FAILED:', err.message)
  process.exitCode = 1
} finally {
  chrome.kill('SIGKILL')
}

// ── measure overflow + tap targets ──
async function measure(page, vw) {
  return evalAwait(page, (vw) => {
    const doc = document.documentElement
    const docW = Math.max(doc.scrollWidth, document.body.scrollWidth)
    const offenders = []
    const els = document.querySelectorAll('body *')
    const seen = new Set()
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > vw + 1) {
        const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
        const tag = el.tagName.toLowerCase()
        const key = tag + cls + Math.round(r.right)
        if (seen.has(key)) continue
        seen.add(key)
        offenders.push(`${tag}${cls} right=${Math.round(r.right)} w=${Math.round(r.width)}`)
      }
    }
    // tap target audit: interaktif < 44px
    let tinyTaps = 0
    for (const el of document.querySelectorAll('button, a, [role="button"], input, select')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height < 40 || r.width < 28) tinyTaps++
    }
    return { docW, vw, pageOverflow: docW - vw, offenders: offenders.slice(0, 12), tinyTaps }
  }, vw)
}

// ── CDP helpers ──
async function capture(page, name) {
  const res = await page.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name + '.png'), Buffer.from(res.data, 'base64'))
}
async function evalAwait(page, fn, arg) {
  const r = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'eval failed')
  return r.result?.value
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
async function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no DevTools\n' + stderr)), 10000)
    proc.stderr.on('data', (c) => { stderr += c.toString(); const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error('chrome exited ' + code + '\n' + stderr)) })
  })
}
async function createTarget(port) { const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }); if (!r.ok) throw new Error('target ' + r.status); return r.json() }
function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = []
  ws.addEventListener('message', (m) => { const p = JSON.parse(m.data); if (p.id && pending.has(p.id)) { const { resolve, reject } = pending.get(p.id); pending.delete(p.id); p.error ? reject(new Error(p.error.message)) : resolve(p.result); return } for (const l of listeners) l(p) })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(_e, l) { listeners.push(l) },
      send(method, params = {}) { const rid = ++id; ws.send(JSON.stringify({ id: rid, method, params })); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + method)), 20000); pending.set(rid, { resolve: (v) => { clearTimeout(t); res(v) }, reject: rej }) }) },
    }))
    ws.addEventListener('error', reject)
  })
}
async function navigate(page, url) { await page.send('Page.navigate', { url }); await sleep(1200) }
async function waitFor(page, predicate, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return; await sleep(150) }
  throw new Error('timeout: ' + label)
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[audit] ' + m) }
