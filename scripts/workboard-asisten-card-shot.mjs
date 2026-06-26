// Verifikasi (2026-06-26): pelaksana (ASISTEN) di Workboard "By Program" harus
// LANGSUNG melihat card task miliknya (tidak tersembunyi auto-collapse program
// On Track) supaya bisa klik → modal → lapor progres tanpa masuk Programs.
// Login sebagai pradita.yugantara (ASISTEN). Assert: section program TIDAK
// collapsed + baris task (.wb-row) terlihat + link aksi = "View" (bukan
// "Edit plan"). Klik card → modal TaskDetailView terbuka.
// Run: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=pradita.yugantara node scripts/workboard-asisten-card-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'pradita.yugantara'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-workboard-asisten'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--host-resolver-rules=MAP 10.10.121.14 127.0.0.1', '--window-size=1500,1100', '--force-device-scale-factor=1.5',
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

  step('login as ' + loginId)
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 25000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 15000, 'app shell (login ok?)')

  step('open Workboard (default = By Program + My Tasks for ASISTEN)')
  await navigate(page, `${baseUrl}/execution`)
  await waitFor(page, () => document.querySelectorAll('.wb-prog').length > 0, 45000, 'program sections')
  await sleep(700)
  await capture(page, '01-asisten-byprogram', 'Workboard By Program — view ASISTEN')

  const sectionCount = await evalAwait(page, () => document.querySelectorAll('.wb-prog').length)
  const collapsedCount = await evalAwait(page, () => document.querySelectorAll('.wb-prog--collapsed').length)
  const visibleRows = await evalAwait(page, () => document.querySelectorAll('.wb-row').length)
  const planLinks = await evalAwait(page, () => [...document.querySelectorAll('.wb-prog__plan-link')].map(a => a.textContent.trim()))
  findings.push('Program sections: ' + sectionCount)
  findings.push('Collapsed sections: ' + collapsedCount + (collapsedCount === 0 ? ' OK (tidak ada yg tersembunyi)' : ' ⚠ masih ada yg collapsed'))
  findings.push('Visible task rows: ' + visibleRows + (visibleRows > 0 ? ' OK' : ' ⚠ card task TIDAK terlihat'))
  findings.push('Plan-link labels: ' + JSON.stringify(planLinks) + (planLinks.every(l => /view/i.test(l)) ? ' OK (View)' : ' ⚠ ada "Edit plan"'))

  step('click first task row → expect TaskDetailModal')
  const clicked = await evalAwait(page, () => { const r = document.querySelector('.wb-row'); if (r) { r.click(); return true } return false })
  if (clicked) {
    await waitFor(page, () => !!document.querySelector('.task-detail-modal'), 8000, 'task detail modal')
    await sleep(800)
    await capture(page, '02-task-modal', 'Task card → modal TaskDetailView (jalur lapor)')
    const canReport = await evalAwait(page, () => {
      // tombol/kontrol progres muncul utk PIC; cek progress control hadir & enabled
      const slider = document.querySelector('input[type="range"], .progress-input, [data-progress-input]')
      const blocked = [...document.querySelectorAll('*')].some(e => /only the assigned pic or program owner/i.test(e.textContent || '') && e.children.length === 0)
      return { hasProgressControl: !!slider, blockedMsgShown: blocked }
    })
    findings.push('Modal opened: OK')
    findings.push('Progress control present: ' + canReport.hasProgressControl)
    findings.push('Blocked-message shown: ' + canReport.blockedMsgShown + (canReport.blockedMsgShown ? ' ⚠ asisten diblok' : ' OK (boleh lapor)'))
  } else {
    findings.push('⚠ Tidak ada .wb-row untuk diklik')
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
async function navigate(page, url) { await page.send('Page.navigate', { url }); await sleep(2800) }
async function waitFor(page, predicate, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) { const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true }); if (r.result?.value) return; await sleep(150) }
  throw new Error('timeout: ' + label)
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const i=document.querySelector(${JSON.stringify(selector)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()` })
}
function step(m) { console.log('[smoke] ' + m) }
