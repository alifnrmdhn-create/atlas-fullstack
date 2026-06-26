// Hover the timeline "now" marker column and screenshot the redesigned
// multi-row marker tooltip (color-coded rows), light + dark.

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'alif.nugraha.ramadhan'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'Password123!'
const programId = process.env.SMOKE_PROGRAM_ID ?? '197'
const outDir = process.env.OUT_DIR ?? '/private/tmp/claude-501/-Users-alif-nugraha-Project-atlas-fullstack/b39278b9-6146-437d-8d50-1e14d8ba321d/scratchpad'
mkdirSync(outDir, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-tip-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--force-device-scale-factor=2',
  '--window-size=1500,1000', '--remote-debugging-port=0',
  `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Input.enable').catch(() => {})

  step('login')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier') && document.querySelector('#password'), 10_000, 'login form')
  await typeInput(page, '#identifier', loginId)
  await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type=\\'submit\\']')?.click()` })
  await waitFor(page, () => location.pathname !== '/login', 15_000, 'left /login')

  step('open charter')
  await navigate(page, `${baseUrl}/programs/${programId}/charter`)
  await waitFor(page, () => document.querySelector('.atl-col-now, .atl-col-now--past'), 25_000, 'now marker')
  await new Promise(r => setTimeout(r, 600))

  // Center of the "now" marker cell (a header or body cell carrying the class).
  const pt = await evaluate(page, () => {
    const el = document.querySelector('.atl-head--mon.atl-col-now, .atl-cell--mon.atl-col-now, .atl-col-now')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
  })
  if (!pt) throw new Error('no now-marker cell')
  step(`hover (${pt.x},${pt.y})`)
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y })
  await new Promise(r => setTimeout(r, 400))

  for (const theme of ['light', 'dark']) {
    await page.send('Runtime.evaluate', { expression: `document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)})` })
    await new Promise(r => setTimeout(r, 300))
    // Re-hover after theme swap to keep tooltip alive.
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y + 1 })
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y })
    await new Promise(r => setTimeout(r, 300))
    const shot = await page.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `charter-tip-${theme}.png`), Buffer.from(shot.data, 'base64'))
    step(`saved charter-tip-${theme}.png`)
  }
  console.log(`\nDone → ${outDir}`)
} finally {
  chrome.kill('SIGTERM')
  try { rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) } catch {}
}

async function waitForDevToolsEndpoint(proc) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Chrome no DevTools.\n${stderr}`)), 10_000)
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (m) { clearTimeout(timer); resolve(m[1]) }
    })
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}).\n${stderr}`)) })
  })
}
async function createTarget(port) {
  const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  if (!r.ok) throw new Error(`target ${r.status}`)
  return r.json()
}
function connectCDP(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const listeners = { event: [] }
  ws.addEventListener('message', (message) => {
    const p = JSON.parse(message.data)
    if (p.id && pending.has(p.id)) {
      const { resolve, reject } = pending.get(p.id); pending.delete(p.id)
      if (p.error) reject(new Error(p.error.message)); else resolve(p.result); return
    }
    for (const l of listeners.event) l(p)
  })
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve({
      on(e, l) { listeners[e].push(l) },
      send(method, params = {}) {
        const rid = ++id
        ws.send(JSON.stringify({ id: rid, method, params }))
        return new Promise((res, rej) => pending.set(rid, { resolve: res, reject: rej }))
      },
    }))
    ws.addEventListener('error', reject)
  })
}
async function navigate(page, url) { await page.send('Page.navigate', { url }); await waitForEvent(page, 'Page.loadEventFired', 15_000) }
function waitForEvent(page, method, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out ${method}`)), timeoutMs)
    page.on('event', function l(e) { if (e.method === method) { clearTimeout(timer); resolve(e) } })
  })
}
async function waitFor(page, predicate, timeoutMs, label = 'condition') {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const r = await page.send('Runtime.evaluate', { expression: `Boolean((${predicate.toString()})())`, returnByValue: true })
    if (r.result?.value) return
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error(`Timed out: ${label}`)
}
async function evaluate(page, fn) {
  const r = await page.send('Runtime.evaluate', { expression: `(${fn.toString()})()`, returnByValue: true })
  if (r.exceptionDetails) throw new Error(`evaluate: ${r.exceptionDetails.text}`)
  return r.result?.value
}
async function typeInput(page, selector, value) {
  await page.send('Runtime.evaluate', { expression: `
    (() => { const i = document.querySelector(${JSON.stringify(selector)});
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      s.call(i, ${JSON.stringify(value)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true })); })()` })
}
function step(m) { console.log(`[tip-shot] ${m}`) }
