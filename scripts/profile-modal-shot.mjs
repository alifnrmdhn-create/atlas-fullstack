// Visual smoke (fitur view-profile 2026-06-26): klik baris Presence → modal profil
// (UserProfileModal) muncul; klik foto → ImageLightbox; cek dark mode.
// Jalankan: APP_URL=http://localhost:9000 node scripts/profile-modal-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-profile-modal'
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

  step('open /presence')
  await navigate(page, `${baseUrl}/presence`)
  await waitFor(page, () => document.querySelectorAll('.presence-row--clickable').length > 0, 15000, 'presence rows clickable')
  await capture(page, '01-presence', 'Presence — rows clickable')

  // Prefer baris dengan foto+atasan (mis. "Dimas") agar Reports-to & tombol foto teruji.
  step('click a presence row (prefer one with photo + manager)')
  const targetName = process.env.SMOKE_TARGET_NAME ?? 'Dimas'
  const clicked = await evalAwait(page, (name) => {
    const rows = [...document.querySelectorAll('.presence-row--clickable')]
    const byName = rows.find(r => (r.textContent || '').includes(name))
    const withPhoto = rows.find(r => r.querySelector('img.presence-row__avatar-img'))
    const el = byName ?? withPhoto ?? rows[0]
    if (!el) return { ok: false }
    el.click()
    return { ok: true, hasPhoto: !!el.querySelector('img.presence-row__avatar-img'), matchedName: !!byName }
  }, targetName)
  await waitFor(page, () => !!document.querySelector('.upm-modal'), 8000, 'profile modal')
  await sleep(500)
  await capture(page, '02-profile-modal', 'UserProfileModal terbuka')

  findings.push(await assertLabels(page, 'Profile modal', ['Workload', 'Active tasks']))
  const hasDm = await evalAwait(page, () => !!document.querySelector('.upm-footer .ds-button'))
  const hasSupervisor = await evalAwait(page, () => !!document.querySelector('.upm-supervisor'))
  findings.push(`Send DM button: ${hasDm ? 'OK tampil' : '— (mungkin diri sendiri)'}`)
  findings.push(`Reports-to (atasan): ${hasSupervisor ? 'OK tampil' : '— (tak ada manager)'}`)

  // Lightbox: klik foto bila ada
  if (clicked.hasPhoto) {
    step('click photo → lightbox')
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.upm-avatar-btn.is-photo')?.click()` })
    await sleep(500)
    const hasLightbox = await evalAwait(page, () => !!document.querySelector('.lightbox-overlay'))
    findings.push(`Lightbox foto: ${hasLightbox ? 'OK terbuka' : '⚠ tidak terbuka'}`)
    if (hasLightbox) await capture(page, '03-lightbox', 'ImageLightbox foto penuh')
    await page.send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))` })
    await sleep(300)
  } else {
    findings.push('Lightbox foto: — (baris dipilih tanpa foto, inisial)')
  }

  // Dark mode — set via localStorage lalu reload (mekanisme tema ATLAS)
  step('dark mode: localStorage atlas.theme=dark + reload')
  await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme','dark')` })
  await navigate(page, `${baseUrl}/presence`)
  await waitFor(page, () => document.documentElement.getAttribute('data-theme') === 'dark' && document.querySelectorAll('.presence-row--clickable').length > 0, 12000, 'dark presence')
  // Pilih baris dengan foto bila ada (uji avatar + lightbox di dark juga)
  await evalAwait(page, () => {
    const rows = [...document.querySelectorAll('.presence-row--clickable')]
    const el = rows.find(r => r.querySelector('img.presence-row__avatar-img')) ?? rows[0]
    el?.click()
  })
  await waitFor(page, () => !!document.querySelector('.upm-modal'), 8000, 'dark profile modal')
  await sleep(500)
  await capture(page, '04-profile-modal-dark', 'Modal profil — dark mode')

  console.log('\n── FINDINGS ──')
  findings.forEach(f => console.log('  • ' + f))
  console.log('\n── SHOTS ──')
  shots.forEach(s => console.log('  ' + s))
} catch (err) {
  console.error('[smoke] FAIL:', err.message)
  process.exitCode = 1
} finally {
  chrome.kill('SIGKILL')
}

async function capture(page, name, label) {
  const res = await page.send('Page.captureScreenshot', { format: 'png' })
  const file = join(OUT, name + '.png')
  writeFileSync(file, Buffer.from(res.data, 'base64'))
  shots.push(file + '  (' + label + ')')
}
async function assertLabels(page, scope, labels) {
  const present = await evalAwait(page, (lbls) => {
    const modal = document.querySelector('.upm-modal, [role="dialog"]')
    const txt = (modal?.innerText ?? '')
    return lbls.map((l) => ({ l, ok: txt.toLowerCase().includes(l.toLowerCase()) }))
  }, labels)
  const missing = present.filter((p) => !p.ok).map((p) => p.l)
  return `${scope}: ` + (missing.length === 0 ? `OK — semua tampil (${labels.join(', ')})` : `⚠ HILANG: ${missing.join(', ')}`)
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
