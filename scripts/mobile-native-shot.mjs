// Visual smoke (mobile-native Jun 2026): Home launcher marketplace + All-menu
// sheet di phone 390px. Verifikasi (1) HomeMobile render (greeting + search +
// status strip + menu grid), (2) sheet "All menu" terbuka dari hamburger.
// Jalankan: SMOKE_LOGIN_ID=bod_kmr@ptpn SMOKE_LOGIN_PASSWORD=DKMR2026 node scripts/mobile-native-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-mobile-native'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=390,844', '--force-device-scale-factor=2',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
const findings = []
const shots = []

try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')
  // Emulasi metrik phone (390×844, mobile) — penting agar useIsPhone ≤640 aktif.
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  step('login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  step('Home launcher (HomeMobile)')
  await navigate(page, `${baseUrl}/`)
  await waitFor(page, () => !!document.querySelector('.hm'), 15000, 'HomeMobile root')
  await waitFor(page, () => document.querySelectorAll('.hm__metric').length >= 3, 15000, 'status strip loaded')
  await sleep(800)
  await capture(page, '01-home-launcher', 'Home launcher marketplace')

  findings.push(`Greeting hadir: ${await evalAwait(page, () => !!document.querySelector('.hm__greet-name'))}`)
  findings.push(`Search pill hadir: ${await evalAwait(page, () => !!document.querySelector('.hm__search'))}`)
  findings.push(`Status strip cards: ${await evalAwait(page, () => document.querySelectorAll('.hm__metric').length)}`)
  findings.push(`Quick menu tiles: ${await evalAwait(page, () => document.querySelectorAll('.hm__sect .mm-tile').length)}`)
  findings.push(`Needs-action rows: ${await evalAwait(page, () => document.querySelectorAll('.hm__row').length)}`)

  step('open All-menu sheet (bottom-tab Menu)')
  await evalAwait(page, () => {
    const tabs = [...document.querySelectorAll('.mobile-tabbar__item')]
    const menu = tabs[tabs.length - 1] // tombol "Menu" = item terakhir tab bar
    menu?.click()
  })
  await waitFor(page, () => document.querySelector('.mm-sheet--open'), 6000, 'menu sheet open')
  await sleep(500)
  await capture(page, '02-all-menu-sheet', 'All-menu marketplace grid')
  findings.push(`Sheet categories: ${await evalAwait(page, () => document.querySelectorAll('.mm-cat').length)}`)
  findings.push(`Sheet tiles total: ${await evalAwait(page, () => document.querySelectorAll('.mm-sheet .mm-tile').length)}`)

  step('dark mode Home')
  await evalAwait(page, () => {
    document.documentElement.classList.add('dark')
    document.documentElement.setAttribute('data-theme', 'dark')
  })
  await evalAwait(page, () => document.querySelector('.mm-sheet__close')?.click())
  await sleep(500)
  await capture(page, '03-home-dark', 'Home launcher dark mode')

  console.log('\n=== FINDINGS ===')
  findings.forEach((f) => console.log(' - ' + f))
  console.log('\n=== SCREENSHOTS ===')
  shots.forEach((s) => console.log(' - ' + s))
} catch (err) {
  console.error('[smoke] FAILED:', err.message)
  process.exitCode = 1
} finally {
  chrome.kill('SIGKILL')
}

// ── CDP helpers ──
async function capture(page, name, label) {
  const res = await page.send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(res.data, 'base64'))
  shots.push(file + '  (' + label + ')')
}
async function evalAwait(page, fn, arg) {
  const r = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'eval failed')
  return r.result?.value
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
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
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[smoke] ' + m) }
