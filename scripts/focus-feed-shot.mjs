// Visual smoke (audit Focus Jun 2026): feed Focus terpadu — (1) tak ada lagi
// "Today's Commitments" terpisah, (2) escalation committed-by-me muncul sbg item
// dgn CTA Resolve + klik buka triage panel, (3) tombol Snooze ada di item ranked.
// Jalankan: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=bod_kmr@ptpn SMOKE_LOGIN_PASSWORD=DKMR2026 node scripts/focus-feed-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-focus-feed'
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
  // Sinyal "workspace terisi" yang andal = ActionPanel (needsAction) ATAU feed.
  await waitFor(page, () => document.querySelectorAll('.hd-act-row').length > 0 || document.querySelectorAll('.fokus-hero-card, .fokus-row').length > 0, 15000, 'workspace data')
  await sleep(1200)
  await capture(page, '01-feed', 'Focus feed terpadu')

  // (1) tidak ada "Today's Commitments"
  const hasCommitments = await evalAwait(page, () => document.body.innerText.includes("Today's Commitments"))
  findings.push(`Today's Commitments section removed: ${hasCommitments ? '⚠ MASIH ADA' : 'OK — hilang'}`)

  // (2) escalation committed muncul (CTA Resolve)
  const hasResolve = await evalAwait(page, () => {
    const txt = document.querySelector('.fokus-page')?.innerText ?? ''
    return txt.includes('committed to clear') || /Resolve/.test(txt)
  })
  findings.push(`Committed-escalation item present: ${hasResolve ? 'OK' : '⚠ tak terlihat'}`)

  // (3) tombol snooze ada
  const snoozeCount = await evalAwait(page, () => document.querySelectorAll('button[aria-label="Snooze until tomorrow"]').length)
  findings.push(`Snooze buttons: ${snoozeCount}`)

  step('click escalation item → triage panel (Resolve inline)')
  const clicked = await evalAwait(page, () => {
    const cards = [...document.querySelectorAll('.fokus-hero-card, .fokus-row')]
    const card = cards.find(c => /commit/i.test(c.innerText) || /Resolve/.test(c.innerText))
    if (!card) return false
    const btn = card.querySelector('.fokus-cta')
    if (btn) { btn.click(); return true }
    return false
  })
  if (clicked) {
    await waitFor(page, () => !!document.querySelector('.side-panel'), 8000, 'triage panel')
    await sleep(400)
    const hasResolveBtn = await evalAwait(page, () => (document.querySelector('.side-panel')?.innerText ?? '').includes('Mark Resolved'))
    findings.push(`Triage panel Resolve action: ${hasResolveBtn ? 'OK — Mark Resolved tampil' : '⚠ tidak ada'}`)
    await capture(page, '02-escalation-triage', 'Triage Resolve inline')
  } else {
    findings.push('Triage panel: ⚠ item escalation tak ditemukan utk diklik')
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
async function _waitForOr(page, predicate, timeoutMs) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return true; await sleep(200) }
  return false
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[smoke] ' + m) }
