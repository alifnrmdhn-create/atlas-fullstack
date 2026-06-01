// One-off visual smoke for Home — login as a data-bearing user, capture top + scrolled.
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

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-shot-'))
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

  if (process.env.THEME) {
    await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme', ${JSON.stringify(process.env.THEME)})` })
  }
  await navigate(page, `${baseUrl}/`)
  await waitFor(page, () => document.querySelector('.hvc__hud') && document.querySelectorAll('.hvc__hcard').length >= 2, 15000, 'home hero')
  await sleep(900)

  await shot(page, join(outDir, 'home-top.png'))

  // detail crop of the hero band for close inspection
  const box = await page.send('Runtime.evaluate', {
    expression: `(() => { const e = document.querySelector('.hvc__maphero') || document.querySelector('.hvc__hud'); const r = e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}); })()`,
    returnByValue: true,
  })
  const b = JSON.parse(box.result.value)
  const clip = { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), width: b.w + 12, height: b.h + 12, scale: 2 }
  const cap = await page.send('Page.captureScreenshot', { format: 'png', clip })
  writeFileSync(join(outDir, 'home-hero.png'), Buffer.from(cap.data, 'base64'))

  const box3 = await page.send('Runtime.evaluate', {
    expression: `(() => { const v=document.querySelector('.hvc__verdict-card'); const i=document.querySelector('.hvc__intel'); if(!v) return 'null'; const a=v.getBoundingClientRect(); const b=(i||v).getBoundingClientRect(); return JSON.stringify({x:a.x,y:a.y,w:a.width,bottom:b.bottom}); })()`,
    returnByValue: true,
  })
  if (box3.result.value !== 'null') {
    const c3 = JSON.parse(box3.result.value)
    const cap3 = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, c3.x - 6), y: Math.max(0, c3.y - 6), width: c3.w + 12, height: (c3.bottom - c3.y) + 12, scale: 2 } })
    writeFileSync(join(outDir, 'home-verdict.png'), Buffer.from(cap3.data, 'base64'))
  }

  const box2 = await page.send('Runtime.evaluate', {
    expression: `(() => { const e = document.querySelector('.hvc__grid--cmd'); if(!e) return 'null'; const r = e.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}); })()`,
    returnByValue: true,
  })
  if (box2.result.value !== 'null') {
    const c2 = JSON.parse(box2.result.value)
    const cap2 = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, c2.x - 6), y: Math.max(0, c2.y - 6), width: c2.w + 12, height: c2.h + 12, scale: 2 } })
    writeFileSync(join(outDir, 'home-cmd.png'), Buffer.from(cap2.data, 'base64'))
  }

  // scroll the inner workspace to where the floating cluster used to overlap
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.workspace__content').scrollTo(0, 520)` })
  await sleep(500)
  await shot(page, join(outDir, 'home-scrolled.png'))

  await page.send('Runtime.evaluate', { expression: `document.querySelector('.workspace__content').scrollTo(0, 1100)` })
  await sleep(500)
  await shot(page, join(outDir, 'home-scrolled2.png'))

  console.log('OK shots: home-top.png, home-scrolled.png, home-scrolled2.png in', outDir)
} catch (e) {
  console.error('SHOT FAILED:', e.message, '\n', stderr.slice(-400))
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
