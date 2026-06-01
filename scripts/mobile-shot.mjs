// Mobile/tablet visual smoke — login as a data-bearing user, capture several
// routes at small viewports so we can see how the shell holds up sub-1024.
// Usage: node scripts/mobile-shot.mjs   (env: APP_URL, SMOKE_LOGIN_ID, SMOKE_LOGIN_PASSWORD, OUT_DIR)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
// Default Jimmy (3000906) — satu-satunya user yang masih Password123! (out-of-the-box).
// Untuk halaman data-kaya (18 programs + Performance), pakai Audi 3027985 via
// SMOKE_LOGIN_ID — passwordnya sudah diganti, set sementara lalu restore hash asli.
const loginId = process.env.SMOKE_LOGIN_ID ?? '3000906'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const outDir = process.env.OUT_DIR ?? '/tmp/atlas-mobile'

// Fase 0 inventory: phone only, sweep every primary page at 390px.
// DEVICES_JSON env overrides (e.g. desktop regression check).
const devices = process.env.DEVICES_JSON ? JSON.parse(process.env.DEVICES_JSON) : [
  { name: 'iphone', width: 390, height: 844, dpr: 3, mobile: true },
]
const settleMs = Number(process.env.SETTLE_MS ?? 1100)
const routes = process.env.ROUTES_JSON ? JSON.parse(process.env.ROUTES_JSON) : [
  { name: '01-home', path: '/' },
  { name: '02-programs', path: '/programs' },
  { name: '03-program-detail', path: '/programs/148' },
  { name: '04-charter', path: '/programs/148/charter' },
  { name: '05-execution', path: '/execution' },
  { name: '06-penugasan', path: '/penugasan' },
  { name: '07-jadwal', path: '/jadwal' },
  { name: '08-perf-scorecard', path: '/performance/scorecard' },
  { name: '09-perf-divisi', path: '/performance/divisi' },
  { name: '10-perf-me', path: '/performance/me' },
  { name: '11-perf-kolegial', path: '/performance/kolegial' },
  { name: '12-presence', path: '/presence' },
  { name: '13-playbook', path: '/playbook' },
  { name: '14-panduan', path: '/panduan' },
  { name: '15-channels', path: '/channels' },
  { name: '16-profile', path: '/profile' },
  { name: '17-settings', path: '/settings' },
]

import { mkdirSync } from 'node:fs'
mkdirSync(outDir, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-mshot-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-color-profile=srgb',
  '--window-size=390,844', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
try {
  const wsEndpoint = await waitForDevToolsEndpoint(chrome)
  const port = new URL(wsEndpoint).port
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')

  // login once at phone size
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 12000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  for (const d of devices) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: d.width, height: d.height, deviceScaleFactor: d.dpr, mobile: d.mobile })
    for (const r of routes) {
      try {
        await navigate(page, `${baseUrl}${r.path}`)
        await waitFor(page, () => document.querySelector('.app-shell'), 20000, `${r.name} shell`)
        await sleep(settleMs)
        await shot(page, join(outDir, `${d.name}-${r.name}.png`))
        console.log('OK', `${d.name}-${r.name}.png`)
        if (process.env.CHAIN) {
          const c = await page.send('Runtime.evaluate', {
            expression: `(() => {
              let el = document.querySelector('.view-performance') || document.querySelector('.perf');
              const chain = [];
              while (el && el !== document.documentElement) {
                const cs = getComputedStyle(el);
                chain.push((el.className||el.tagName)+' | w='+Math.round(el.getBoundingClientRect().width)+' display='+cs.display+' gridCols='+cs.gridTemplateColumns+' width='+cs.width+' flex='+cs.flex);
                el = el.parentElement;
              }
              return JSON.stringify(chain, null, 1);
            })()`,
            returnByValue: true,
          })
          console.log('   CHAIN', r.name, c.result.value)
        }
        if (process.env.MEASURE) {
          const m = await page.send('Runtime.evaluate', {
            expression: `(() => {
              const vw = window.innerWidth;
              const offenders = [];
              document.querySelectorAll('.workspace__content *').forEach(el => {
                if (el.scrollWidth > vw + 1 || el.getBoundingClientRect().right > vw + 1) {
                  const r = el.getBoundingClientRect();
                  if (r.width > 60) offenders.push((el.className||el.tagName)+' w='+Math.round(r.width)+' right='+Math.round(r.right)+' sw='+el.scrollWidth);
                }
              });
              return JSON.stringify({vw, docSW: document.documentElement.scrollWidth, wsSW: document.querySelector('.workspace__content')?.scrollWidth, top: offenders.slice(0,12)}, null, 1);
            })()`,
            returnByValue: true,
          })
          console.log('   MEASURE', r.name, m.result.value)
        }
        if (process.env.SCROLL_TABS) {
          const info = await page.send('Runtime.evaluate', {
            expression: `(() => { const e = document.querySelector('.scroll-tabs'); if(!e) return 'none'; const sc = e.scrollWidth > e.clientWidth; e.scrollLeft = e.scrollWidth; return JSON.stringify({scrollable: sc, sw: e.scrollWidth, cw: e.clientWidth}); })()`,
            returnByValue: true,
          })
          console.log('   scroll-tabs:', info.result.value)
          await sleep(450)
          await shot(page, join(outDir, `${d.name}-${r.name}-tabend.png`))
        }
        if (process.env.OPEN_NAV) {
          await page.send('Runtime.evaluate', { expression: `document.querySelector('.topbar__hamburger')?.click()` })
          await sleep(450)
          await shot(page, join(outDir, `${d.name}-${r.name}-navopen.png`))
          console.log('OK', `${d.name}-${r.name}-navopen.png`)
          await page.send('Runtime.evaluate', { expression: `document.querySelector('.app-shell__scrim')?.click()` })
          await sleep(350)
        }
      } catch (e) {
        console.error('skip', `${d.name}-${r.name}`, e.message)
      }
    }
  }
  console.log('DONE shots in', outDir)
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
