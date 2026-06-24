// Visual smoke (Jun 2026): item "Needs Action" di Focus kini punya disposition
// panel (Berikan dukungan / Teruskan ke atas / Tandai ditangani) alih-alih cuma
// melempar ke workspace program. Script: login → /fokus → klik baris ActionPanel
// → assert SidePanel + tombol follow-up tampil → screenshot.
// Jalankan: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=atlas.admin node scripts/focus-disposition-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-focus-disposition'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1440,1100', '--force-device-scale-factor=1.5',
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
  await waitFor(page, () => document.querySelectorAll('.hd-act-row').length > 0, 15000, 'needs-action rows')
  await sleep(400)
  await capture(page, '01-focus', 'Focus dengan Needs Action panel')

  const rowCount = await evalAwait(page, () => document.querySelectorAll('.hd-act-row').length)
  findings.push(`Needs Action rows: ${rowCount}`)

  step('click first Needs Action row → disposition panel')
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.hd-act-row')?.click()` })
  await waitFor(page, () => !!document.querySelector('.side-panel'), 8000, 'disposition side panel')
  await sleep(500)
  await capture(page, '02-disposition-panel', 'Disposition panel terbuka')

  findings.push(await assertPanelButtons(page))

  step('open "Berikan dukungan" note form')
  await clickWhere(page, '.side-panel button', 'Berikan dukungan')
  await sleep(400)
  const hasTextarea = await evalAwait(page, () => !!document.querySelector('.side-panel textarea'))
  findings.push(`Support note form: ${hasTextarea ? 'OK — textarea arahan tampil' : '⚠ textarea TIDAK muncul'}`)
  await capture(page, '03-support-form', 'Form arahan ke PIC')

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

async function assertPanelButtons(page) {
  const txt = await evalAwait(page, () => document.querySelector('.side-panel')?.innerText ?? '')
  const want = ['Berikan dukungan', 'Tandai sudah ditangani']
  const missing = want.filter((w) => !txt.includes(w))
  return 'Disposition buttons: ' + (missing.length === 0 ? `OK — ${want.join(', ')}` : `⚠ HILANG: ${missing.join(', ')}`)
}

// ── CDP helpers ──
async function capture(page, name, label) {
  const res = await page.send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(res.data, 'base64'))
  shots.push(file + '  (' + label + ')')
}
async function clickWhere(page, selector, textIncludes) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})];const el=els.find(e=>(e.textContent||'').toLowerCase().includes(${JSON.stringify(textIncludes.toLowerCase())}));if(el)el.click();return !!el;})()`, returnByValue: true })
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
