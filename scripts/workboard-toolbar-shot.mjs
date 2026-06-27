// Visual smoke (2026-06-27): Workboard filter toolbar when filters multiply.
// Login → /execution → capture toolbar default → select a Program + Workstream +
// toggle Blockers-only → capture the "crowded" toolbar. Light + dark.
// Run: APP_URL=http://localhost:9000 SMOKE_LOGIN_ID=atlas.admin node scripts/workboard-toolbar-shot.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'atlas.admin'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const OUT = process.env.OUT_DIR ?? '/tmp/atlas-workboard-toolbar'
// Width matters: T1 laptop 1366 is where the crowded row wraps.
const WIDTH = Number(process.env.SHOT_WIDTH ?? 1366)
mkdirSync(OUT, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', `--window-size=${WIDTH},900`, '--force-device-scale-factor=2',
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

  for (const theme of ['light', 'dark']) {
    step(`theme=${theme}`)
    await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme', ${JSON.stringify(theme)})` })
    await navigate(page, `${baseUrl}/execution`)
    await waitFor(page, () => document.querySelectorAll('.view-toggle-btn').length > 0, 15000, 'board toolbar')
    await sleep(700)
    // Switch to "Urgency" group-by so the time-filter chips appear (the crowded case).
    await evalAwait(page, () => {
      const btn = [...document.querySelectorAll('.wb-groupby .view-toggle-btn')].find(b => /urgency/i.test(b.textContent || ''))
      btn?.click()
    })
    await sleep(700)
    await captureToolbar(page, `01-${theme}-default`, 'urgency-mode default toolbar')

    // Make filters multiply: pick first real program, first workstream, blockers-only.
    await evalAwait(page, () => {
      const sel = document.querySelectorAll('.wb-program-filter')[0]
      if (sel && sel.options.length > 1) {
        sel.value = sel.options[1].value
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })
    await sleep(800)
    await evalAwait(page, () => {
      const sel = document.querySelectorAll('.wb-program-filter')[1]
      if (sel && sel.options.length > 1) {
        sel.value = sel.options[1].value
        sel.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const chip = document.querySelector('.wb-blocker-chip')
      if (chip && !chip.classList.contains('is-on')) chip.click()
    })
    await sleep(800)
    await captureToolbar(page, `02-${theme}-filters-added`, 'program + workstream + blockers active')

    if (theme === 'light') {
      findings.push('Program options: ' + await evalAwait(page, () => document.querySelectorAll('.wb-program-filter')[0]?.options.length))
      findings.push('Toolbar height (px): ' + await evalAwait(page, () => Math.round(document.querySelector('.wb-toolbar-filters')?.getBoundingClientRect().height || 0)))
      findings.push('Toolbar wrapped to N visual rows: ' + await evalAwait(page, () => {
        const tb = document.querySelector('.wb-toolbar-filters'); if (!tb) return '?'
        const tops = new Set([...tb.children].map(c => Math.round(c.getBoundingClientRect().top)))
        return tops.size
      }))
    }
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
async function captureToolbar(page, name, label) {
  // Clip to the toolbar region (a little padding above/below) for a tight crop.
  const box = await evalAwait(page, () => {
    const tb = document.querySelector('.wb-toolbar-filters')
    if (!tb) return null
    const r = tb.getBoundingClientRect()
    return { x: Math.max(0, r.left - 24), y: Math.max(0, r.top - 16), width: Math.min(window.innerWidth, r.width + 48), height: r.height + 32 }
  })
  const opts = { format: 'png' }
  if (box) opts.clip = { ...box, scale: 1 }
  const res = await page.send('Page.captureScreenshot', opts)
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
