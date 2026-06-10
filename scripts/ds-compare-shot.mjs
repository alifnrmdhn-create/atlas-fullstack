/* One-off: screenshot perbandingan design-system baru vs halaman legacy.
 * Reuse pola CDP dari browser-smoke.mjs. Output PNG ke /tmp/atlas-ds-compare/. */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://127.0.0.1:8000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const outDir = '/tmp/atlas-ds-compare'
const theme = process.env.THEME ?? 'light'
const shots = (process.env.SHOTS ?? '/design-system:1-design-system-NEW,/performance/divisi:2-performance-divisi-NEW,/programs:3-programs-LEGACY,/presence:4-presence-LEGACY,/settings:5-settings-LEGACY')
  .split(',').map((s) => { const [path, name] = s.split(':'); return { path, name: name ?? path.replace(/\W+/g, '-') } })

mkdirSync(outDir, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-shot-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-device-scale-factor=2', '--window-size=1440,1000',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable')
  await page.send('Runtime.enable')

  log('login (fetch POST + CSRF)')
  await navigate(page, `${baseUrl}/login`) // dapatkan XSRF-TOKEN cookie
  await waitFor(page, () => Boolean(document.cookie.match(/XSRF-TOKEN=/)), 8000, 'xsrf cookie')
  const auth = await page.send('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const xsrf = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/)||[])[1]||'');
      const r = await fetch('/login', { method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json','Accept':'application/json','X-Requested-With':'XMLHttpRequest','X-XSRF-TOKEN':xsrf },
        body: JSON.stringify({ identifier:${JSON.stringify(loginId)}, password:${JSON.stringify(loginPassword)} }) });
      return JSON.stringify({ status:r.status, url:r.url });
    })()`,
  })
  console.error('AUTH:', auth.result?.value)
  await navigate(page, `${baseUrl}/`)
  await waitFor(page, () => Boolean(document.querySelector('.app-shell')), 15000, 'app shell')
  // Paksa tema LIGHT supaya perbandingan NEW vs LEGACY setara (bukan dark vs light)
  await page.send('Runtime.evaluate', { expression: `(() => { try { localStorage.setItem('atlas.theme', '${theme}'); document.documentElement.setAttribute('data-theme', '${theme}'); } catch(e){} })()` })

  for (const shot of shots) {
    log(`shot ${shot.path}`)
    await navigate(page, `${baseUrl}${shot.path}`)
    await page.send('Runtime.evaluate', { expression: `document.documentElement.setAttribute('data-theme', '${theme}')` })
    await waitFor(page, () => document.body && document.body.innerText.trim().length > 50, 10000, shot.path).catch(() => {})
    await sleep(700)
    if (process.env.DISPATCH) {
      await page.send('Runtime.evaluate', { expression: `window.dispatchEvent(new CustomEvent('atlas:topbar-action', { detail: { id: ${JSON.stringify(process.env.DISPATCH)}, page: location.pathname } }))` })
      await sleep(500)
    }
    await sleep(400) // biar animasi entrance + data render settle
    const { cssContentSize } = await page.send('Page.getLayoutMetrics')
    const height = Math.min(Math.ceil(cssContentSize.height), 4000)
    const result = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height, scale: 1 },
    })
    writeFileSync(join(outDir, `${shot.name}.png`), Buffer.from(result.data, 'base64'))
    log(`  saved ${shot.name}.png (${cssContentSize.width}x${height})`)
  }
  console.log(`\n✓ Screenshots di ${outDir}`)
} catch (err) {
  console.error('FAILED:', err.message)
  console.error(stderr.slice(-500))
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function log(m) { console.log(`[shot] ${m}`) }
function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${label}`)), ms))])
}
async function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no DevTools endpoint.\n${stderr}`)), 10000)
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (m) { clearTimeout(timer); resolve(m[1]) }
    })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code})`)) })
  })
}
async function createTarget(port) {
  const r = await withTimeout(fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }), 10000, 'create target')
  if (!r.ok) throw new Error(`create target ${r.status}`)
  return r.json()
}
function connectCDP(wsUrl) {
  const sock = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const listeners = []
  sock.addEventListener('message', (msg) => {
    const p = JSON.parse(msg.data)
    if (p.id && pending.has(p.id)) {
      const { resolve, reject } = pending.get(p.id); pending.delete(p.id)
      p.error ? reject(new Error(p.error.message)) : resolve(p.result); return
    }
    for (const l of listeners) l(p)
  })
  return new Promise((resolve, reject) => {
    sock.addEventListener('open', () => resolve({
      on(_e, l) { listeners.push(l) },
      send(method, params = {}) {
        const reqId = ++id
        sock.send(JSON.stringify({ id: reqId, method, params }))
        return withTimeout(new Promise((res, rej) => pending.set(reqId, { resolve: res, reject: rej })), 20000, method)
      },
    }))
    sock.addEventListener('error', reject)
  })
}
async function navigate(page, url) {
  const loaded = waitForEvent(page, 'Page.loadEventFired', 15000)
  await page.send('Page.navigate', { url })
  await loaded.catch(() => {})
}
function waitForEvent(page, method, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), ms)
    page.on('event', (p) => { if (p.method === method) { clearTimeout(timer); resolve(p.params) } })
  })
}
async function waitFor(page, predicate, ms, label) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true })
    if (r.result?.value) return
    await sleep(150)
  }
  throw new Error(`waitFor failed: ${label}`)
}
async function _typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', {
    expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.focus(); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true })); el.blur(); } })()`,
  })
}
