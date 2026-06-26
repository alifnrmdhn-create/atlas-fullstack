// Visual smoke (2026-06-26): verifikasi kolom "Reports To" di tabel Position
// Management + field "Atasan (Reports To)" di modal Edit Position.
// Jalankan: APP_URL=http://localhost:9000 node scripts/positions-hierarchy-shot.mjs
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-positions-hier'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1680,1100', '--force-device-scale-factor=1.5',
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
  await sleep(400)
  // Submit via form.requestSubmit (lebih andal untuk Inertia useForm), retry bila perlu.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.send('Runtime.evaluate', { expression: `(()=>{const f=document.querySelector('form');if(f&&f.requestSubmit){f.requestSubmit()}else{document.querySelector('button[type="submit"]')?.click()}})()` })
    try {
      await waitFor(page, () => location.pathname !== '/login' && document.querySelector('.app-shell'), 8000, 'app shell')
      break
    } catch {
      if (attempt === 2) throw new Error('login gagal setelah 3 percobaan')
      await sleep(1500)
    }
  }

  step('open /admin/positions')
  await navigate(page, `${baseUrl}/admin/positions`)
  await waitFor(page, () => document.querySelectorAll('.reports-table tbody tr').length > 1, 15000, 'positions table')
  await sleep(500)
  await capture(page, '01-positions-table', 'Tabel dengan kolom Reports To')

  // Assert kolom header "Reports To" ada.
  const hasCol = await evalAwait(page, () => {
    const ths = [...document.querySelectorAll('.reports-table thead th')].map(t => t.textContent.trim().toLowerCase())
    return ths.some(t => t.includes('reports to') || t.includes('atasan'))
  })
  findings.push('Kolom Reports To: ' + (hasCol ? 'OK — header tampil' : '⚠ TIDAK ada header'))

  // Assert minimal satu baris menampilkan parent (code-badge) di kolom Reports To.
  const filledRows = await evalAwait(page, () => {
    const rows = [...document.querySelectorAll('.reports-table tbody tr')]
    let filled = 0
    for (const r of rows) {
      const cell = r.querySelector('td[data-label="Reports To"]')
      if (cell && cell.querySelector('.code-badge')) filled++
    }
    return filled
  })
  findings.push('Baris dengan atasan terisi: ' + filledRows + (filledRows > 0 ? ' (OK)' : ' (⚠ kosong semua)'))

  step('open Edit modal pada baris pertama')
  await clickWhere(page, '.reports-table tbody tr:first-child button', 'Edit')
  await waitFor(page, () => !!document.querySelector('.modal, [role="dialog"]'), 8000, 'edit modal')
  await sleep(500)
  await capture(page, '02-edit-modal', 'Modal Edit Position dengan field Atasan')
  findings.push(await assertLabels(page, 'Modal Edit', ['Reports To', 'No superior']))

  // Assert select Reports To benar-benar ada dengan opsi.
  const selInfo = await evalAwait(page, () => {
    const modal = document.querySelector('.modal, [role="dialog"]')
    const selects = [...(modal?.querySelectorAll('select') ?? [])]
    const sel = selects.find(s => [...s.options].some(o => o.textContent.toLowerCase().includes('superior') || o.textContent.toLowerCase().includes('puncak')))
    return sel ? { found: true, options: sel.options.length } : { found: false, options: 0 }
  })
  findings.push('Select Atasan: ' + (selInfo.found ? `OK — ${selInfo.options} opsi` : '⚠ select tidak ditemukan'))

  console.log('\n=== FINDINGS ===')
  findings.forEach(f => console.log('  ' + f))
  console.log('\n=== SHOTS ===')
  shots.forEach(s => console.log('  ' + s))
} catch (e) {
  console.error('[smoke] ERROR:', e.message)
  process.exitCode = 1
} finally {
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
async function assertLabels(page, scope, labels) {
  const present = await evalAwait(page, (lbls) => {
    const modal = document.querySelector('.modal, [role="dialog"]')
    const txt = (modal?.innerText ?? '')
    return lbls.map((l) => ({ l, ok: txt.toLowerCase().includes(l.toLowerCase()) }))
  }, labels)
  const missing = present.filter((p) => !p.ok).map((p) => p.l)
  return `${scope}: ` + (missing.length === 0 ? `OK — field tampil (${labels.join(', ')})` : `⚠ HILANG: ${missing.join(', ')}`)
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
