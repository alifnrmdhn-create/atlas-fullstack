// Visual smoke (audit Focus Jun 2026 — aksi inline): kartu blocker/task di feed
// Focus, saat diklik (role non-BOD), membuka FocusQuickPanel untuk Resolve blocker
// / Log progress TANPA pindah halaman. Login KASUBDIV (alif.nugraha.ramadhan).
// Jalankan: APP_URL=http://localhost:9000 node scripts/focus-quick-shot.mjs
// PENTING: bersihkan chrome strays antar run → `pkill -f atlas-chrome-`
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'alif.nugraha.ramadhan'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-focus-quick'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1440,1300', '--force-device-scale-factor=1.5',
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
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell')

  step('open Focus')
  await navigate(page, `${baseUrl}/fokus`)
  await waitFor(page, () => document.querySelectorAll('.fokus-hero-card, .fokus-row').length > 0, 15000, 'focus feed')
  await sleep(1000)
  const feedCount = await evalAwait(page, () => document.querySelectorAll('.fokus-hero-card, .fokus-row').length)
  findings.push(`Feed items: ${feedCount}`)
  await capture(page, '01-feed', 'Feed KASUBDIV')

  step('click hero CTA → quick panel')
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.fokus-hero-card .fokus-cta')?.click()` })
  const opened = await waitForOr(page, () => !!document.querySelector('.side-panel'), 6000)
  if (opened) {
    await sleep(400)
    const panelText = await evalAwait(page, () => document.querySelector('.side-panel')?.innerText ?? '')
    const kind = /Resolve blocker/.test(panelText) ? 'blocker (Resolve)'
      : /Log progress/.test(panelText) ? 'task (Log progress)' : 'OTHER'
    findings.push(`Hero quick panel: ${kind !== 'OTHER' ? 'OK — ' + kind : '⚠ panel lain: ' + panelText.slice(0, 40)}`)
    findings.push(`Has "Open full detail": ${panelText.includes('Open full detail') ? 'OK' : '⚠ tidak ada'}`)
    await capture(page, '02-quick-panel', 'Quick panel inline')
    // tutup
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.side-panel-backdrop')?.click()` })
    await sleep(400)
  } else {
    findings.push('Hero quick panel: ⚠ tidak terbuka')
  }

  step('click a row CTA → quick panel (kind kedua bila ada)')
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.fokus-row .fokus-cta')?.click()` })
  const opened2 = await waitForOr(page, () => !!document.querySelector('.side-panel'), 6000)
  if (opened2) {
    await sleep(400)
    const t = await evalAwait(page, () => document.querySelector('.side-panel')?.innerText ?? '')
    const kind = /Resolve blocker/.test(t) ? 'blocker (Resolve)' : /Log progress/.test(t) ? 'task (Log progress)' : 'OTHER'
    findings.push(`Row quick panel: ${kind !== 'OTHER' ? 'OK — ' + kind : 'panel: ' + t.slice(0, 40)}`)
    await capture(page, '03-row-quick-panel', 'Row quick panel')
  } else {
    findings.push('Row quick panel: (tidak terbuka — mungkin item bukan task/blocker)')
  }

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
async function waitForOr(page, predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return true; await sleep(200) }
  return false
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[smoke] ' + m) }
