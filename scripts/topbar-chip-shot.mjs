// Visual smoke (2026-06-24): verifikasi chip topbar menampilkan jabatan di bawah
// nama (ellipsis), dan popover identity menampilkan jabatan PENUH.
// Jalankan: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=alif.nugraha.ramadhan node scripts/topbar-chip-shot.mjs
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'alif.nugraha.ramadhan'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-topbar-chip'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1440,900', '--force-device-scale-factor=2',
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

  step('login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 8000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]').click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.topbar__avatar-btn'), 12000, 'shell loaded')
  await sleep(800)

  // chip collapsed
  const chip = await evalAwait(page, () => {
    const name = document.querySelector('.topbar__avatar-name')?.innerText ?? null
    const title = document.querySelector('.topbar__avatar-title')?.innerText ?? null
    const titleEl = document.querySelector('.topbar__avatar-title')
    const clipped = titleEl ? titleEl.scrollWidth > titleEl.clientWidth + 1 : false
    const btn = document.querySelector('.topbar__avatar-btn')
    const w = btn ? Math.round(btn.getBoundingClientRect().width) : null
    return { name, title, clipped, btnWidth: w }
  })
  findings.push(`chip: name="${chip.name}" title="${chip.title}" (ellipsis=${chip.clipped}, btnWidth=${chip.btnWidth}px)`)
  await capture(page, '01-chip', 'topbar chip collapsed')

  // open popover
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.topbar__avatar-btn').click()` })
  await sleep(500)
  const pop = await evalAwait(page, () => {
    const full = document.querySelector('.topbar__user-popover-title')?.innerText ?? null
    const el = document.querySelector('.topbar__user-popover-title')
    const clipped = el ? el.scrollWidth > el.clientWidth + 1 : null
    return { full, clipped }
  })
  findings.push(`popover: title="${pop.full}" (clipped=${pop.clipped} → false=tampil penuh)`)
  await capture(page, '02-popover', 'topbar popover full title')
} catch (e) {
  findings.push('ERROR: ' + e.message)
  process.exitCode = 1
} finally {
  console.log('\n=== FINDINGS ===')
  findings.forEach((f) => console.log('  ' + f))
  console.log('\n=== SHOTS ===')
  shots.forEach((s) => console.log('  ' + s))
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
}

// ── CDP helpers (disalin dari edit-modals-shot.mjs) ──
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
