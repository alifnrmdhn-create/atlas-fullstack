// Verifikasi deep-link filter Home → ProgramsView: tiap URL tak 404, ProgramsView
// termuat, chip filter render, dan list ter-filter (count). Capture screenshot.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const outDir = process.env.OUT_DIR ?? '/tmp'
const VW = 1536, VH = 960

const TESTS = [
  ['status=terlambat&division=DKSA', 'f-delayed-dksa'],
  ['completed=1', 'f-completed'],
  ['deadline=overdue', 'f-overdue'],
  ['deadline=overdue,le30&progress=early', 'f-map-high-early'],
  ['status=at_risk', 'f-atrisk'],
]

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-vf-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars',
  `--window-size=${VW},${VH}`, '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
try {
  const wsEndpoint = await waitForDevToolsEndpoint(chrome)
  const port = new URL(wsEndpoint).port
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')
  await page.send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: false })

  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 12000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  for (const [qs, name] of TESTS) {
    await navigate(page, `${baseUrl}/programs?${qs}`)
    await sleep(1100)
    const probe = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const txt = document.body.innerText || ''
        const is404 = /\\b404\\b/.test(txt) && /Not Found/i.test(txt)
        const pv = !!document.querySelector('.programs-v2') || !!document.querySelector('.programs-controls__filters')
        const chips = Array.from(document.querySelectorAll('.programs-filter-chip--active, .programs-filter-chip--removable')).map(e => e.textContent.trim())
        // hitung baris program di view aktif (list/table/board)
        const rows = document.querySelectorAll('.programs-list-row, .programs-table tbody tr, .program-card, .programs-card, .kanban-card')
        return JSON.stringify({ path: location.pathname + location.search, is404, programsView: pv, chips, visibleRows: rows.length })
      })()`,
    })
    const r = JSON.parse(probe.result.value)
    const status = r.is404 ? 'FAIL-404' : (r.programsView ? 'OK' : 'FAIL-no-view')
    console.log(`[${status}] ${name} :: ${r.path} | chips=[${r.chips.join(' | ')}] | rows=${r.visibleRows}`)
    await shot(page, join(outDir, `${name}.png`))
  }
  console.log('Screenshots in', outDir)
} catch (e) {
  console.error('VERIFY FAILED:', e.message, '\n', stderr.slice(-400))
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
}

async function shot(page, path) { const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(path, Buffer.from(data, 'base64')) }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function waitForDevToolsEndpoint(proc) { return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`No DevTools endpoint.\n${stderr}`)), 12000); proc.stderr.on('data', (c) => { stderr += c.toString(); const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } }); proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited ${code}.\n${stderr}`)) }) }) }
function connectCDP(wsUrl) { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = { event: [] }; ws.addEventListener('message', (message) => { const payload = JSON.parse(message.data); if (payload.id && pending.has(payload.id)) { const { resolve, reject } = pending.get(payload.id); pending.delete(payload.id); payload.error ? reject(new Error(payload.error.message)) : resolve(payload.result); return } for (const l of listeners.event) l(payload) }); return new Promise((resolve, reject) => { ws.addEventListener('open', () => resolve({ on(ev, l) { listeners[ev].push(l) }, send(method, params = {}) { const rid = ++id; ws.send(JSON.stringify({ id: rid, method, params })); return withTimeout(new Promise((res, rej) => pending.set(rid, { resolve: res, reject: rej })), 15000, method) }, })); ws.addEventListener('error', reject) }) }
async function navigate(page, url) { await page.send('Page.navigate', { url }); await waitForEvent(page, 'Page.loadEventFired', 15000) }
function waitForEvent(page, method, timeoutMs) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${method}`)), timeoutMs); page.on('event', (e) => { if (e.method === method) { clearTimeout(t); resolve(e) } }) }) }
async function waitFor(page, predicate, timeoutMs, label) { const s = Date.now(); while (Date.now() - s < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return; await sleep(150) } throw new Error(`Timeout ${label}`) }
async function typeInput(page, selector, value) { await page.send('Runtime.evaluate', { expression: `(() => { const i = document.querySelector(${JSON.stringify(selector)}); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); })()` }) }
function withTimeout(p, ms, label) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${label}`)), ms); p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) }) }) }
