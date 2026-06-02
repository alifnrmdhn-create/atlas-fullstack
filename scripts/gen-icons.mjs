// Generate PWA icons from the ATLAS brand mark (green gradient square + white
// angular "A"). Renders an HTML page at exact pixel sizes via headless Chrome
// and screenshots → public/icons/*.png. Run: node scripts/gen-icons.mjs
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const outDir = join(process.cwd(), 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// sizes: [name, px, padScale, radiusScale] — padScale = logo size as fraction of canvas
// (maskable wants ~0.5 safe zone). radiusScale = corner radius as fraction of canvas;
// 0 = full-bleed square (REQUIRED for maskable so the OS applies its own mask cleanly).
const targets = [
  ['icon-192.png', 192, 0.62, 0.22],
  ['icon-512.png', 512, 0.62, 0.22],
  ['icon-maskable-512.png', 512, 0.52, 0], // full bleed, no radius — platform masks it
  ['apple-touch-icon.png', 180, 0.62, 0.22],
  ['favicon-32.png', 32, 0.70, 0.22],
]

function iconHTML(px, logoScale, radiusScale) {
  const inner = Math.round(px * logoScale)
  const radius = Math.round(px * radiusScale)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .wrap{width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#2D8C3E 0%,#0a4d20 100%);border-radius:${radius}px;overflow:hidden}
    svg{width:${inner}px;height:${inner}px}
  </style></head><body><div class="wrap">
    <svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round">
      <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
      <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
      <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
    </svg></div></body></html>`
}

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-icon-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
try {
  const wsEndpoint = await waitForDevToolsEndpoint(chrome)
  const port = new URL(wsEndpoint).port
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')

  for (const [name, px, scale, radiusScale] of targets) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: px, height: px, deviceScaleFactor: 1, mobile: false })
    // Capture with a transparent backdrop so corners outside the border-radius are
    // alpha=0, not white. Without this Chrome paints an opaque white default bg.
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })
    const html = iconHTML(px, scale, radiusScale)
    await page.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) })
    await waitForEvent(page, 'Page.loadEventFired', 8000)
    await sleep(120)
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: px, height: px, scale: 1 } })
    writeFileSync(join(outDir, name), Buffer.from(data, 'base64'))
    console.log('OK', name, `${px}x${px}`)
  }
  console.log('DONE icons in', outDir)
} catch (e) {
  console.error('ICON GEN FAILED:', e.message, '\n', stderr.slice(-300))
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
  ws.addEventListener('message', (m) => {
    const p = JSON.parse(m.data)
    if (p.id && pending.has(p.id)) { const { resolve, reject } = pending.get(p.id); pending.delete(p.id); p.error ? reject(new Error(p.error.message)) : resolve(p.result); return }
    for (const l of listeners.event) l(p)
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(ev, l) { listeners[ev].push(l) },
      send(method, params = {}) { const rid = ++id; ws.send(JSON.stringify({ id: rid, method, params })); return new Promise((res, rej) => pending.set(rid, { resolve: res, reject: rej })) },
    }))
    ws.addEventListener('error', reject)
  })
}
function waitForEvent(page, method, timeoutMs) { return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(`Timeout ${method}`)), timeoutMs); page.on('event', (e) => { if (e.method === method) { clearTimeout(t); resolve(e) } }) }) }
