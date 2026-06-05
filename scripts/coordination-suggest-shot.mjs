// Visual smoke for Meeting Recommendations: collapsed chip (Upcoming), expanded,
// hidden on By Person, and dismiss persisting across reload.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const outDir = process.env.OUT_DIR ?? '/tmp'
const VW = parseInt(process.env.VW ?? '1536', 10)
const VH = parseInt(process.env.VH ?? '960', 10)

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-co-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars',
  `--window-size=${VW},${VH}`, '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
async function evalJson(page, expr) {
  const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true })
  return r.result.value
}
async function clip(page, sel, name) {
  const v = await evalJson(page, `(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'null'; const r=e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}); })()`)
  if (v === 'null') { console.log('  (no', sel, ')'); return false }
  const b = JSON.parse(v)
  const cap = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), width: b.w + 12, height: b.h + 12, scale: 2 } })
  writeFileSync(join(outDir, name), Buffer.from(cap.data, 'base64'))
  console.log('  shot', name)
  return true
}

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

  // Start from a clean preference state so we exercise the default (collapsed)
  await page.send('Runtime.evaluate', { expression: `localStorage.removeItem('atlas.schedule.suggestDismissed'); localStorage.removeItem('atlas.schedule.suggestExpanded')` })

  await navigate(page, `${baseUrl}/jadwal`)
  await waitFor(page, () => document.querySelector('.view-schedule'), 15000, 'schedule view')
  await waitFor(page, () => document.querySelector('.suggestions-banner'), 12000, 'suggestions banner')
  await sleep(500)

  // 1) Default = collapsed chip on Upcoming tab
  const collapsed = await evalJson(page, `Boolean(document.querySelector('.suggestions-banner--collapsed'))`)
  console.log('  collapsed-by-default:', collapsed)
  await clip(page, '.suggestions-banner', 'coord-suggest-collapsed.png')

  // 2) Expand
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.suggestions-banner__title').click()` })
  await sleep(400)
  const hasList = await evalJson(page, `Boolean(document.querySelector('.suggestions-banner__list'))`)
  console.log('  expanded-shows-list:', hasList)
  await clip(page, '.suggestions-banner', 'coord-suggest-expanded.png')

  // 3) By Person tab → banner must be gone
  await page.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('.view-toggle-btn')].find(b => b.textContent.trim()==='By Person')?.click()` })
  await sleep(500)
  const onPerson = await evalJson(page, `Boolean(document.querySelector('.suggestions-banner'))`)
  console.log('  banner-on-by-person (want false):', onPerson)

  // 4) Back to Upcoming, dismiss, reload → must stay gone
  await page.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('.view-toggle-btn')].find(b => b.textContent.trim()==='Upcoming')?.click()` })
  await sleep(400)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.suggestions-banner__dismiss').click()` })
  await sleep(300)
  const afterDismiss = await evalJson(page, `Boolean(document.querySelector('.suggestions-banner'))`)
  console.log('  banner-after-dismiss (want false):', afterDismiss)
  await navigate(page, `${baseUrl}/jadwal`)
  await waitFor(page, () => document.querySelector('.view-schedule'), 15000, 'schedule reload')
  await sleep(800)
  const afterReload = await evalJson(page, `Boolean(document.querySelector('.suggestions-banner'))`)
  console.log('  banner-after-reload (want false):', afterReload)

  const pass = collapsed && hasList && !onPerson && !afterDismiss && !afterReload
  console.log(pass ? '\nOK all assertions passed' : '\nFAIL — some assertion did not hold')
  if (!pass) process.exitCode = 1
} catch (e) {
  console.error('SHOT FAILED:', e.message, '\n', stderr.slice(-400))
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
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
