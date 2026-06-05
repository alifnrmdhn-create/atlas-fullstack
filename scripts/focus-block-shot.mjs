// Visual smoke for multi-day Focus Block: new modal layout (start/end date,
// all-day toggle) + a 3-day block rendering as one card per day in the list.
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
const VH = parseInt(process.env.VH ?? '1000', 10)
const SMOKE_TITLE = 'SMOKE Multi-day Focus'

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-fb-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars',
  `--window-size=${VW},${VH}`, '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
async function ev(page, expr) {
  const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  return r.result.value
}
async function clip(page, sel, name) {
  const v = await ev(page, `(() => { const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'null'; const r=e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}); })()`)
  if (v === 'null') { console.log('  (no', sel, ')'); return false }
  const b = JSON.parse(v)
  const cap = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
    clip: { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), width: b.w + 12, height: b.h + 12, scale: 2 } })
  writeFileSync(join(outDir, name), Buffer.from(cap.data, 'base64'))
  console.log('  shot', name)
  return true
}
async function setInput(page, sel, val) {
  await ev(page, `(() => { const i=document.querySelector(${JSON.stringify(sel)}); const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; s.call(i, ${JSON.stringify(val)}); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})); })()`)
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
  await setInput(page, '#identifier', loginId)
  await setInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  await navigate(page, `${baseUrl}/jadwal`)
  await waitFor(page, () => document.querySelector('.view-schedule'), 15000, 'schedule view')
  await sleep(500)

  // Open the Focus Block modal
  await ev(page, `[...document.querySelectorAll('button')].find(b => /Focus Block/i.test(b.textContent))?.click()`)
  await waitFor(page, () => document.querySelector('.schedule-focus-dt'), 8000, 'focus modal')
  await sleep(300)

  // New layout present? start date + end date + all-day toggle + 2 time inputs
  const layout = await ev(page, `JSON.stringify({
    dates: document.querySelectorAll('.schedule-focus-dt input[type=date]').length,
    times: document.querySelectorAll('.schedule-focus-dt input[type=time]').length,
    allday: !!document.querySelector('.schedule-focus-dt__allday input[type=checkbox]'),
  })`)
  console.log('  layout:', layout)
  await clip(page, '.schedule-modal, .modal', 'focus-modal-default.png')

  // Toggle All day → time inputs should disappear
  await ev(page, `document.querySelector('.schedule-focus-dt__allday input').click()`)
  await sleep(250)
  const timesAfterAllday = await ev(page, `document.querySelectorAll('.schedule-focus-dt input[type=time]').length`)
  console.log('  time-inputs-after-allday (want 0):', timesAfterAllday)
  // Turn all-day back off for the multi-day timed test
  await ev(page, `document.querySelector('.schedule-focus-dt__allday input').click()`)
  await sleep(200)

  // Fill: label, end date = start + 2 days
  const startDate = await ev(page, `document.querySelectorAll('.schedule-focus-dt input[type=date]')[0].value`)
  const d = new Date(startDate + 'T00:00:00'); d.setDate(d.getDate() + 2)
  const endDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  await setInput(page, '.schedule-focus-dt__row:first-child input[type=text]', SMOKE_TITLE) // (no-op if not text here)
  // label field is the first text input in the modal body
  await setInput(page, '.modal-section .modal-field:first-child input[type=text]', SMOKE_TITLE)
  await setInput(page, '.schedule-focus-dt__row .schedule-focus-dt__cell:nth-child(2) input[type=date]', endDate)
  await sleep(200)
  await clip(page, '.schedule-modal, .modal', 'focus-modal-multiday.png')

  // Save
  await ev(page, `[...document.querySelectorAll('button')].find(b => /Save Block/i.test(b.textContent))?.click()`)
  await sleep(1200)

  // The list should now contain Day 1/3 .. Day 3/3 for this block
  const dayBadges = await ev(page, `JSON.stringify([...document.querySelectorAll('.schedule-card--focus')].map(c => c.textContent.replace(/\\s+/g,' ').trim()).filter(t => /SMOKE Multi-day Focus/.test(t)))`)
  console.log('  focus cards:', dayBadges)
  const parsed = JSON.parse(dayBadges)
  const has3 = parsed.some(t=>/Day 1\/3/.test(t)) && parsed.some(t=>/Day 2\/3/.test(t)) && parsed.some(t=>/Day 3\/3/.test(t))
  console.log('  renders-3-day-segments:', has3)
  await clip(page, '.schedule-content', 'focus-list-multiday.png')

  // Calendar view should render per-day focus segments without breaking layout
  await ev(page, `[...document.querySelectorAll('.schedule-view-toggle__btn')].find(b => /Calendar/i.test(b.title))?.click()`)
  await sleep(700)
  const calFocus = await ev(page, `document.querySelectorAll('.schedule-cal-event--focus').length`)
  console.log('  calendar focus segments rendered:', calFocus)
  await clip(page, '.schedule-cal', 'focus-calendar-multiday.png')

  const pass = JSON.parse(layout).dates === 2 && JSON.parse(layout).times === 2 && JSON.parse(layout).allday && timesAfterAllday === 0 && has3
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
function withTimeout(p, ms, label) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${label}`)), ms); p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) }) }) }
