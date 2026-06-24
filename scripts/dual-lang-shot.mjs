// Visual smoke: modal pengumuman dual-language (sekali-saja) di Home.
// Jalankan: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=bod_kmr@ptpn SMOKE_LOGIN_PASSWORD=DKMR2026 node scripts/dual-lang-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-dual-lang'
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1440,1100', '--force-device-scale-factor=1.5',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
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

  // Pastikan localStorage guard kosong supaya modal berkesempatan tampil.
  // (Flag DB toursCompleted di luar kendali script — kalau user sudah pernah
  //  dismiss, modal tidak akan muncul; itu justru bukti "sekali saja" bekerja.)
  await page.send('Runtime.evaluate', { expression: `localStorage.removeItem('atlas.announce.dualLanguage')` })

  for (const theme of ['light', 'dark']) {
    step(`${theme} → Home`)
    await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme', '${theme}')` })
    await navigate(page, `${baseUrl}/`)
    await waitFor(page, () => document.querySelector('.app-shell'), 12000, 'app shell home')
    const shown = await waitForOr(page, () => document.querySelector('.modal__title')?.textContent?.includes('Bahasa'), 6000)
    await sleep(900)
    await capture(page, `home-modal-${theme}`)
    const title = await evalAwait(page, () => document.querySelector('.modal__title')?.textContent ?? '(tidak ada modal)')
    console.log(`  [${theme}] modal tampil: ${shown ? 'YA' : 'TIDAK'} — judul: "${title}"`)
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
