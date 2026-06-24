// Visual smoke dark-mode: screenshot halaman yang paling banyak dimigrasi token,
// di theme DARK (tempat bolong muncul) + 1 pembanding LIGHT untuk Home.
// Jalankan: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=bod_kmr@ptpn SMOKE_LOGIN_PASSWORD=DKMR2026 node scripts/darkmode-shot.mjs
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-darkmode'
mkdirSync(OUT, { recursive: true })

const PAGES = [
  { path: '/', name: 'home', ready: () => document.querySelector('.app-shell') },
  { path: '/workboard', name: 'workboard', ready: () => document.querySelector('.app-shell') },
  { path: '/performance/scorecard', name: 'scorecard', ready: () => document.querySelector('.app-shell') },
  { path: '/assignments', name: 'assignments', ready: () => document.querySelector('.app-shell') },
  { path: '/programs', name: 'programs', ready: () => document.querySelector('.app-shell') },
]

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1440,1200', '--force-device-scale-factor=1.5',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
const shots = []

try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')

  step('login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  for (const theme of ['dark', 'light']) {
    // set theme di localStorage lalu reload supaya hydrate
    await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme', '${theme}')` })
    for (const p of PAGES) {
      // di theme light hanya ambil home sebagai pembanding (bolong hanya nampak di dark)
      if (theme === 'light' && p.name !== 'home') continue
      step(`${theme} → ${p.path}`)
      await navigate(page, `${baseUrl}${p.path}`)
      await waitForOr(page, p.ready, 12000)
      // pastikan atribut theme benar
      const resolved = await evalAwait(page, () => document.documentElement.getAttribute('data-theme'))
      await sleep(1400)
      const name = `${theme}-${p.name}`
      await capture(page, name)
      // deteksi heuristik bolong: elemen dgn bg putih solid di dark
      let whiteSurfaces = 0
      if (theme === 'dark') {
        whiteSurfaces = await evalAwait(page, () => {
          let n = 0
          for (const el of document.querySelectorAll('.app-shell *')) {
            const bg = getComputedStyle(el).backgroundColor
            const m = bg.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
            if (m && +m[1] > 240 && +m[2] > 240 && +m[3] > 240) {
              const r = el.getBoundingClientRect()
              if (r.width > 80 && r.height > 40) n++
            }
          }
          return n
        })
      }
      shots.push({ name, theme: resolved, whiteSurfaces })
    }
  }

  console.log('\n=== HASIL ===')
  for (const s of shots) {
    const flag = s.theme === 'dark' && s.whiteSurfaces > 0 ? `  ⚠ ${s.whiteSurfaces} permukaan putih besar (cek manual)` : ''
    console.log(`  ${s.name}  [theme=${s.theme}]${flag}`)
  }
  console.log(`\nScreenshot → ${OUT}`)
} catch (e) {
  console.error('SMOKE GAGAL:', e.message)
  process.exitCode = 1
} finally {
  chrome.kill()
}

async function capture(page, name) {
  const r = await page.send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.data, 'base64'))
}
async function evalAwait(page, fn) {
  const r = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})()`, returnByValue: true })
  return r.result?.value
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
async function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no DevTools\n' + stderr)), 10000)
    proc.stderr.on('data', (c) => { stderr += c.toString(); const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]) } })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error('chrome exited ' + code + '\n' + stderr)) })
  })
}
async function createTarget(port) { const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }); if (!r.ok) throw new Error('target ' + r.status); return r.json() }
function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const listeners = []
  ws.addEventListener('message', (m) => { const p = JSON.parse(m.data); if (p.id && pending.has(p.id)) { const { resolve, reject } = pending.get(p.id); pending.delete(p.id); p.error ? reject(new Error(p.error.message)) : resolve(p.result); return } for (const l of listeners) l(p) })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(_e, l) { listeners.push(l) },
      send(method, params = {}) { const rid = ++id; ws.send(JSON.stringify({ id: rid, method, params })); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + method)), 20000); pending.set(rid, { resolve: (v) => { clearTimeout(t); res(v) }, reject: rej }) }) },
    }))
    ws.addEventListener('error', reject)
  })
}
async function navigate(page, url) { await page.send('Page.navigate', { url }); await sleep(1200) }
async function waitFor(page, predicate, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return; await sleep(150) }
  throw new Error('timeout: ' + label)
}
async function waitForOr(page, predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return true; await sleep(200) }
  return false
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[smoke] ' + m) }
