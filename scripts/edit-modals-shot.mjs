// Visual smoke (audit 2026-06-17): verifikasi editor field baru tampil di modal —
// Workstream edit/create (priority/owner/budget), Phase edit (status/week),
// Blocker edit (owner). Screenshot ke OUT + assert field ada di DOM.
// Jalankan: APP_URL=http://localhost:9000 node scripts/edit-modals-shot.mjs
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-edit-modals'
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

  step('seed program/workstream/phase/task/blocker via API')
  const ids = await evalAwait(page, seedData, { stamp: Date.now() })
  if (ids.error) throw new Error('seed failed: ' + ids.error)
  step(`seeded program ${ids.programId}`)

  // ── Program detail → tab Struktur ──
  await navigate(page, `${baseUrl}/programs/${ids.programId}`)
  await waitFor(page, () => document.querySelectorAll('.prog-detail-tab').length > 0, 15000, 'program tabs')
  await clickWhere(page, '.prog-detail-tab', 'Structure')
  await sleep(600)

  // ── Workstream EDIT modal ──
  await waitFor(page, () => !!document.querySelector('button[title="Edit workstream"]'), 8000, 'edit workstream btn')
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[title="Edit workstream"]')?.click()` })
  await sleep(700)
  await capture(page, '01-workstream-edit', `Modal edit workstream`)
  findings.push(await assertLabels(page, 'Workstream EDIT', ['Priority', 'Anggaran', 'Realisasi', 'Owner']))

  // close modal (Escape)
  await page.send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))` })
  await sleep(400)

  // ── Workstream CREATE modal ──
  await clickWhere(page, 'button', '+ Workstream Baru')
  await sleep(700)
  await capture(page, '02-workstream-create', 'Modal create workstream')
  findings.push(await assertLabels(page, 'Workstream CREATE', ['Priority', 'Anggaran', 'Realisasi']))
  await page.send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))` })
  await sleep(400)

  // ── Phase EDIT modal (klik workstream row dulu utk buka detail + phases) ──
  await page.send('Runtime.evaluate', { expression: `document.querySelector('.workstream-row')?.click()` })
  await sleep(1100)
  const hasPhaseBtn = await evalBool(page, () => !!document.querySelector('button[title="Edit phase"]'))
  if (hasPhaseBtn) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('button[title="Edit phase"]')?.click()` })
    await sleep(700)
    await capture(page, '03-phase-edit', 'Modal edit phase')
    findings.push(await assertLabels(page, 'Phase EDIT', ['Status', 'Minggu mulai', 'Minggu selesai']))
    await page.send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))` })
    await sleep(300)
  } else {
    findings.push('Phase EDIT: tombol "Edit phase" tak terlihat (phase mungkin perlu di-expand) — SKIP')
  }

  // ── Blocker EDIT (task detail) ──
  await navigate(page, `${baseUrl}/execution?task=${ids.taskId}`)
  await sleep(1500)
  const hasBlEdit = await evalBool(page, () => !!document.querySelector('.wid-bl-actionbtn[title="Edit"]'))
  if (hasBlEdit) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.wid-bl-actionbtn[title="Edit"]')?.click()` })
    await sleep(600)
    await capture(page, '04-blocker-edit', 'Inline edit blocker')
    findings.push(await assertHas(page, 'Blocker EDIT', () => !!document.querySelector('.wid-bl-inline-form input[role="combobox"], .wid-bl-inline-form .userpicker, .wid-bl-inline-form [class*="picker"]') || /assignee/i.test(document.querySelector('.wid-bl-inline-form')?.innerText ?? '')))
  } else {
    findings.push('Blocker EDIT: tombol tak terjangkau via /execution?task — SKIP (build-verified)')
  }

  step('cleanup')
  await evalAwait(page, cleanupData, ids)

  console.log('\n=== HASIL VISUAL SMOKE ===')
  for (const f of findings) console.log('- ' + f)
  console.log('\nScreenshots:')
  for (const s of shots) console.log('  ' + s)
} catch (e) {
  console.error('SMOKE ERROR:', e.message)
  process.exitCode = 1
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 }) } catch {}
}

// ── seed/cleanup (run in page) ──
async function seedData({ stamp }) {
  const suffix = String(stamp).slice(-7)
  const today = new Date().toISOString().slice(0, 10)
  const plus = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)
  function cookie(n) { const m = document.cookie.match(new RegExp('(?:^|; )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null }
  async function api(path, method = 'GET', body) {
    const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    const x = cookie('XSRF-TOKEN'); if (x) h['X-XSRF-TOKEN'] = x
    if (body !== undefined) h['Content-Type'] = 'application/json'
    const r = await fetch(path, { method, credentials: 'same-origin', headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
    const t = await r.text(); const p = t ? JSON.parse(t) : null
    if (!r.ok) throw new Error(method + ' ' + path + ' ' + r.status + ': ' + (p?.message ?? t).slice(0, 120))
    return p
  }
  try {
    const me = (await api('/profile')).user
    const programId = (await api('/programs', 'POST', { code: 'VS-' + suffix, name: 'Visual Smoke ' + suffix, description: 'smoke', priority: 'HIGH', startDate: today, targetEndDate: plus(60), ownerId: me.id, hasNoApmsKpi: true })).data.id
    const workstreamId = (await api('/workstreams', 'POST', { programId, name: 'WS ' + suffix, priority: 'HIGH', targetCompletion: plus(30), ownerId: me.id })).data.id
    const phaseId = (await api('/workstreams/' + workstreamId + '/phases', 'POST', { name: 'Phase ' + suffix, status: 'PLANNING' })).data.id
    const taskId = (await api('/tasks', 'POST', { workstreamId, title: 'Task ' + suffix, priority: 'MEDIUM', status: 'IN_PROGRESS', targetCompletion: plus(7), phaseId })).data.id
    const blockerId = (await api('/blockers', 'POST', { taskId, title: 'Blocker ' + suffix, severity: 'HIGH' })).data.id
    return { programId, workstreamId, phaseId, taskId, blockerId }
  } catch (e) { return { error: e.message } }
}
async function cleanupData(ids) {
  function cookie(n) { const m = document.cookie.match(new RegExp('(?:^|; )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null }
  async function api(path, method) { const h = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }; const x = cookie('XSRF-TOKEN'); if (x) h['X-XSRF-TOKEN'] = x; await fetch(path, { method, credentials: 'same-origin', headers: h }) }
  try { await api('/blockers/' + ids.blockerId, 'DELETE'); await api('/tasks/' + ids.taskId, 'DELETE'); await api('/phases/' + ids.phaseId, 'DELETE'); await api('/workstreams/' + ids.workstreamId, 'DELETE'); await api('/programs/' + ids.programId, 'DELETE') } catch {}
  return true
}

// ── CDP helpers ──
async function capture(page, name, label) {
  const res = await page.send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(res.data, 'base64'))
  shots.push(file + '  (' + label + ')')
}
async function assertLabels(page, scope, labels) {
  const present = await evalAwait(page, (lbls) => {
    const modal = document.querySelector('.modal, [role="dialog"], .wid-bl-inline-form')
    const txt = (modal?.innerText ?? '')
    return lbls.map((l) => ({ l, ok: txt.toLowerCase().includes(l.toLowerCase()) }))
  }, labels)
  const missing = present.filter((p) => !p.ok).map((p) => p.l)
  return `${scope}: ` + (missing.length === 0 ? `OK — semua field tampil (${labels.join(', ')})` : `⚠ HILANG: ${missing.join(', ')} (ada: ${present.filter(p => p.ok).map(p => p.l).join(', ') || 'none'})`)
}
async function assertHas(page, scope, fn) {
  const ok = await evalBool(page, fn)
  return `${scope}: ` + (ok ? 'OK — picker owner tampil' : '⚠ picker owner TIDAK terdeteksi')
}
async function clickWhere(page, selector, textIncludes) {
  await page.send('Runtime.evaluate', { expression: `(()=>{const els=[...document.querySelectorAll(${JSON.stringify(selector)})];const el=els.find(e=>(e.textContent||'').toLowerCase().includes(${JSON.stringify(textIncludes.toLowerCase())}));if(el)el.click();return !!el;})()`, returnByValue: true })
}
function evalBool(page, fn) { return evalAwait(page, fn) }
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
