// Verifikasi runtime Task 2.3 (route-scoped slice loading):
//  1. Mount di Home  → /tasks,/kpis,/blockers,/apms,/presence,/overview TIDAK di-fetch
//  2. SPA → Workboard → /tasks & /blockers ter-top-up; board terisi
//  3. SPA → Channels  → /users/presence ter-top-up; /tasks TIDAK refetch (masih segar)
//  4. SPA → Programs  → /workspace/overview & /apms/kpi ter-top-up; program-summary TIDAK refetch
// Assertion-based: exit 1 bila ada yang menyimpang. Screenshot tiap fase.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const outDir = process.env.OUT_DIR ?? '/tmp'

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-sweep-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars',
  '--window-size=1536,960', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
const netLog = []
const failures = []

try {
  const wsEndpoint = await waitForDevToolsEndpoint(chrome)
  const port = new URL(wsEndpoint).port
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable')
  page.on('event', (e) => {
    if (e.method === 'Network.requestWillBeSent') {
      const u = e.params.request.url
      if (u.startsWith(baseUrl) && !u.includes('/realtime/poll') && !u.includes('/build/') && !u.includes('5173')) {
        netLog.push(new URL(u).pathname + (new URL(u).search || ''))
      }
    }
  })
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 960, deviceScaleFactor: 2, mobile: false })

  // ── Login ──
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 12000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  // ── Fase 1: Home (mount awal) ──
  netLog.length = 0
  await navigate(page, `${baseUrl}/`)
  await waitFor(page, () => document.querySelector('.hvc__hud'), 15000, 'home hero')
  await sleep(2500)
  const homeReqs = [...netLog]
  await shot(page, join(outDir, 'sweep-home.png'))
  expectHit(homeReqs, 'Home', '/channels')
  expectHit(homeReqs, 'Home', '/programs')
  expectHit(homeReqs, 'Home', '/notifications')
  expectHit(homeReqs, 'Home', '/my-work')
  expectHit(homeReqs, 'Home', '/organization/program-summary')
  expectMiss(homeReqs, 'Home', '/tasks')
  expectMiss(homeReqs, 'Home', '/kpis')
  expectMiss(homeReqs, 'Home', '/blockers')
  expectMiss(homeReqs, 'Home', '/apms/kpi')
  expectMiss(homeReqs, 'Home', '/users/presence')
  expectMiss(homeReqs, 'Home', '/workspace/overview')
  expectMiss(homeReqs, 'Home', '/system/status')
  expectMiss(homeReqs, 'Home', '/search/saved')

  // ── Fase 2: SPA → Workboard (top-up tasks+blockers) ──
  netLog.length = 0
  await page.send('Runtime.evaluate', { expression: `document.querySelector('a[href="/execution"]').click()` })
  await waitFor(page, () => !!document.querySelector('.workboard-v2, .workboard-workspace'), 15000, 'workboard shell')
  await sleep(2500)
  const wbReqs = [...netLog]
  await shot(page, join(outDir, 'sweep-workboard.png'))
  expectHit(wbReqs, 'Workboard', '/tasks')
  expectHit(wbReqs, 'Workboard', '/blockers')
  // Board harus terisi (bukan "No tasks match filter" kosong-diam)
  const cardCount = await evalNum(page, `document.querySelectorAll('[class*="work-card"]').length`)
  if (cardCount === 0) failures.push(`Workboard: 0 kartu task ter-render`)

  // ── Fase 3: SPA → Channels (top-up presence; tasks masih segar → tidak refetch) ──
  netLog.length = 0
  await page.send('Runtime.evaluate', { expression: `document.querySelector('a[href="/channels"]').click()` })
  await waitFor(page, () => !!document.querySelector('.channels-v2'), 15000, 'channels shell')
  await sleep(2500)
  const chReqs = [...netLog]
  await shot(page, join(outDir, 'sweep-channels.png'))
  expectHit(chReqs, 'Channels', '/users/presence')
  expectMiss(chReqs, 'Channels', '/tasks?')        // baru di-fetch di Workboard <5 menit lalu
  expectMissExact(chReqs, 'Channels', '/tasks')

  // ── Fase 4: SPA → Programs (top-up dashboard+apms; program-summary masih segar) ──
  netLog.length = 0
  await page.send('Runtime.evaluate', { expression: `document.querySelector('a[href="/programs"]').click()` })
  await waitFor(page, () => !!document.querySelector('.programs-v2'), 15000, 'programs shell')
  await sleep(2500)
  const prReqs = [...netLog]
  await shot(page, join(outDir, 'sweep-programs.png'))
  expectHit(prReqs, 'Programs', '/workspace/overview')
  expectHit(prReqs, 'Programs', '/apms/kpi')
  expectMiss(prReqs, 'Programs', '/organization/program-summary')

  if (failures.length) {
    console.error('SWEEP GAGAL:')
    for (const f of failures) console.error('  ✗', f)
    process.exitCode = 1
  } else {
    console.log('SWEEP OK — route-scoping & top-up terverifikasi. Screenshot: sweep-*.png di', outDir)
  }
} catch (e) {
  console.error('SWEEP ERROR:', e.message, '\n', stderr.slice(-300))
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
}

function expectHit(reqs, phase, path) {
  if (!reqs.some(r => r === path || r.startsWith(path + '?') || r.startsWith(path + '/'))) failures.push(`${phase}: ${path} TIDAK di-fetch (harusnya iya)`)
}
function expectMiss(reqs, phase, path) {
  if (reqs.some(r => r === path || r.startsWith(path + '?'))) failures.push(`${phase}: ${path} IKUT di-fetch (harusnya tidak)`)
}
function expectMissExact(reqs, phase, path) {
  if (reqs.some(r => r === path)) failures.push(`${phase}: ${path} IKUT di-fetch (harusnya tidak)`)
}
async function evalNum(page, expr) {
  const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true })
  return r.result?.value ?? 0
}
async function shot(page, path) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(path, Buffer.from(data, 'base64'))
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No DevTools endpoint.\n${stderr}`)), 12000)
    proc.stderr.on('data', (c) => { stderr += c.toString(); const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}.\n${stderr}`)) })
  })
}
function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0; const pending = new Map(); const listeners = { event: [] }
  ws.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data)
    if (payload.id && pending.has(payload.id)) { const { resolve, reject } = pending.get(payload.id); pending.delete(payload.id); payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result); return }
    for (const l of listeners.event) l(payload)
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(ev, l) { listeners[ev].push(l) },
      send(method, params = {}) { const rid = ++id; ws.send(JSON.stringify({ id: rid, method, params })); return withTimeout(new Promise((res, rej) => pending.set(rid, { resolve: res, reject: rej })), 15000, method) },
    }))
    ws.addEventListener('error', reject)
  })
}
async function navigate(page, url) { await page.send('Page.navigate', { url }); await waitForEvent(page, 'Page.loadEventFired', 15000) }
function waitForEvent(page, method, timeoutMs) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${method}`)), timeoutMs); page.on('event', (e) => { if (e.method === method) { clearTimeout(t); resolve(e) } }) }) }
async function waitFor(page, predicate, timeoutMs, label) { const s = Date.now(); while (Date.now() - s < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return; await sleep(150) } throw new Error(`Timeout ${label}`) }
async function typeInput(page, selector, value) { await page.send('Runtime.evaluate', { expression: `(() => { const i = document.querySelector(${JSON.stringify(selector)}); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); })()` }) }
function withTimeout(p, ms, label) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${label}`)), ms); p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) }) }) }
