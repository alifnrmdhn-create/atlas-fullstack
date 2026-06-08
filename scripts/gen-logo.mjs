// Generate high-resolution ATLAS brand logos (PNG) into docs/.
// Renders an HTML page via headless Chrome, measures the logo element, and
// screenshots a tight clip at deviceScaleFactor=3 (supersampled) for crisp,
// transparent-background assets. Run: node scripts/gen-logo.mjs
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const outDir = join(process.cwd(), 'docs')
mkdirSync(outDir, { recursive: true })

const SCALE = 3 // supersample factor → output pixels = CSS px × SCALE

// The brand mark — a 1:1 replica of the login page's `.auth-panel__mark`
// (resources/js/Pages/Auth/Login.tsx + AuthEntryView.css). Squircle with the
// exact gradient token --auth-mark-bg (135deg green → green/white mix → gold
// accent), corner radius 14/46 ≈ 30.4%, and the white "A" drawn as three
// strokes on a 20-unit viewBox (strokeWidth 2.2, round caps).
const MARK_GRADIENT =
  'linear-gradient(135deg, #2D8C3E 0%, color-mix(in srgb, #2D8C3E 72%, #FFFFFF 28%) 48%, #B0830C 100%)'

function markDiv(size) {
  const a = Math.round(size * 0.565) // A svg ≈ 26/46 of the square, as on login
  return `<div class="mark" style="width:${size}px;height:${size}px;border-radius:${(size * 0.3043).toFixed(1)}px">
    <svg width="${a}" height="${a}" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
      <line x1="2.5" y1="18.5" x2="10" y2="2.5"/>
      <line x1="17.5" y1="18.5" x2="10" y2="2.5"/>
      <line x1="6.3" y1="11.5" x2="13.7" y2="11.5"/>
    </svg>
  </div>`
}

function pageHTML({ variant }) {
  const dark = variant === 'dark'
  const wordColor = dark ? '#ffffff' : '#15201A'
  const tagColor = dark ? 'rgba(255,255,255,0.66)' : '#5A6B60'
  const markSize = variant === 'mark' ? 600 : 300
  const lockup = variant === 'mark'
    ? markDiv(markSize)
    : `<div class="lockup">
         ${markDiv(markSize)}
         <div class="text">
           <div class="word">ATLAS</div>
           <div class="tag">Advanced Transformation &amp; Leadership Alignment System</div>
         </div>
       </div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    #stage{display:inline-block;padding:40px}
    .lockup{display:flex;align-items:center;gap:40px}
    .mark{display:flex;align-items:center;justify-content:center;line-height:0;
      background:${MARK_GRADIENT}}
    .text{display:flex;flex-direction:column}
    .word{
      font-family:'Geist','SF Pro Display',-apple-system,'Helvetica Neue',Arial,sans-serif;
      font-weight:800;font-size:150px;line-height:0.92;letter-spacing:-0.04em;
      color:${wordColor};-webkit-font-smoothing:antialiased;
    }
    .tag{
      font-family:'Geist','SF Pro Text',-apple-system,'Helvetica Neue',Arial,sans-serif;
      font-weight:500;font-size:25px;letter-spacing:0.2px;
      color:${tagColor};margin-top:18px;-webkit-font-smoothing:antialiased;
    }
  </style></head><body><div id="stage">${lockup}</div></body></html>`
}

const variants = [
  ['atlas-logo.png', { variant: 'light' }],       // horizontal lockup, dark wordmark (use on light bg)
  ['atlas-logo-dark.png', { variant: 'dark' }],   // horizontal lockup, white wordmark (use on dark bg)
  ['atlas-logo-mark.png', { variant: 'mark' }],   // brand mark only
]

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-logo-'))
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
  await page.send('Emulation.setDeviceMetricsOverride', { width: 3200, height: 1400, deviceScaleFactor: SCALE, mobile: false })
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

  for (const [name, opts] of variants) {
    const html = pageHTML(opts)
    await page.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) })
    await waitForEvent(page, 'Page.loadEventFired', 8000)
    await sleep(160) // let fonts settle
    const { result } = await page.send('Runtime.evaluate', {
      expression: `(() => { const r = document.getElementById('stage').getBoundingClientRect();
        return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height }); })()`,
      returnByValue: true,
    })
    const r = JSON.parse(result.value)
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 },
    })
    writeFileSync(join(outDir, name), Buffer.from(data, 'base64'))
    console.log('OK', name, `${Math.round(r.w * SCALE)}x${Math.round(r.h * SCALE)}`)
  }
  console.log('DONE logos in', outDir)
} catch (e) {
  console.error('LOGO GEN FAILED:', e.message, '\n', stderr.slice(-400))
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
