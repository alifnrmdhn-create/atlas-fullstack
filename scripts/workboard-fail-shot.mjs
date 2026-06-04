// Smoke: verify Workboard distinguishes "tasks failed to load" from "empty filter".
// Logs in, FORCES /tasks to fail (CDP Fetch.failRequest) → expects the new error
// state + "Try again". Then unblocks, clicks retry → expects the board to populate.
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

let blockTasks = true // flipped to false before clicking "Try again"
const isTasksUrl = (url) => { try { return new URL(url).pathname === '/tasks' } catch { return false } }

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-wb-'))
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

  // Intercept network: fail /tasks while blockTasks is true, continue everything else.
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  page.on('event', async (e) => {
    if (e.method !== 'Fetch.requestPaused') return
    const { requestId, request } = e.params
    try {
      if (blockTasks && isTasksUrl(request.url)) {
        await page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' })
      } else {
        await page.send('Fetch.continueRequest', { requestId })
      }
    } catch { /* request may already be gone */ }
  })

  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 12000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  await navigate(page, `${baseUrl}/execution`)
  // Expect the FAILURE state (not the misleading "No tasks match the current filter").
  await waitFor(page, () => {
    const els = [...document.querySelectorAll('.section-state strong')].map(e => e.textContent || '')
    return els.some(t => t.includes("Couldn't load tasks"))
  }, 15000, 'failed-state')
  await sleep(400)
  await shot(page, join(outDir, 'workboard-failed.png'))
  const sawMisleading = await page.send('Runtime.evaluate', {
    expression: `document.body.innerText.includes('No tasks match the current filter')`, returnByValue: true,
  })
  console.log('  misleading "No tasks match filter" present while failed?', sawMisleading.result.value)

  // Now unblock and click "Try again" → board should populate with real tasks.
  blockTasks = false
  const clicked = await page.send('Runtime.evaluate', {
    expression: `(() => { const b=[...document.querySelectorAll('.section-state__cta')].find(b => /Try again/i.test(b.textContent)); if(!b) return 'no-button'; b.click(); return 'clicked'; })()`,
    returnByValue: true,
  })
  console.log('  retry button:', clicked.result.value)
  await sleep(4000)
  const diag = await page.send('Runtime.evaluate', {
    expression: `JSON.stringify({ kanbanBoard: !!document.querySelector('.kanban-board'), cols: document.querySelectorAll('.kanban-col').length, badges: [...document.querySelectorAll('.section-badge')].map(b=>b.textContent), stillFailed: document.body.innerText.includes("Couldn't load tasks"), emptyMsg: document.body.innerText.includes('No tasks match the current filter') })`,
    returnByValue: true,
  })
  console.log('  recovery diag:', diag.result.value)
  await shot(page, join(outDir, 'workboard-recovered.png'))
  console.log('OK shots: workboard-failed.png, workboard-recovered.png in', outDir)
} catch (e) {
  console.error('SMOKE FAILED:', e.message, '\n', stderr.slice(-500))
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
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
