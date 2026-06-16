// Rekam scene video demo ATLAS v3 (±92 dtk, narasi PDCA, caption EN kinetic) — playwright-core + Chrome.
// Output: /tmp/atlas-video/scenes/*.webm + manifest.json → demo-assemble.mjs (MUSIC=path utk track).
// PENTING: rekam di atas production build (mv public/hot /tmp dulu) — Vite HMR bisa reload acak.
// Rekam parsial: SCENES=04,11 node scripts/demo-video.mjs
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const OUT = '/tmp/atlas-video'
const SCENES = `${OUT}/scenes`
mkdirSync(SCENES, { recursive: true })
const only = process.env.SCENES ? process.env.SCENES.split(',').map(s => s.trim()) : null

const W = 1920, H = 1080
const CAP_W = 3840, CAP_H = 2160 // capture 4K via deviceScaleFactor 2
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--force-device-scale-factor=2'],
})
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: 'light',
  recordVideo: { dir: SCENES, size: { width: CAP_W, height: CAP_H } },
})

// ---------- login (video halaman ini dibuang) ----------
{
  const page = await ctx.newPage()
  await page.goto(`${baseUrl}/login`)
  await page.fill('#identifier', 'bod_kmr@ptpn')
  await page.fill('#password', 'Password123!')
  await page.click('button[type="submit"]')
  await page.waitForSelector('.app-shell', { timeout: 20000 })
  await page.evaluate(() => localStorage.setItem('atlas.theme', 'light'))
  const v = page.video()
  await page.close()
  if (v) await v.delete().catch(() => {})
  console.log('login OK (light theme set)')
}

// ---------- helpers ----------
const sleep = (page, ms) => page.waitForTimeout(ms)

// Lower-third typographic (tanpa box): scrim gradien sudut kiri-bawah + kicker bar + headline.
async function cap(page, kicker, headline) {
  await page.evaluate(({ kicker, headline }) => {
    document.getElementById('demo-cap')?.remove()
    const el = document.createElement('div')
    el.id = 'demo-cap'
    el.innerHTML = `
      <style>
        #demo-cap { position: fixed; left: 0; bottom: 0; z-index: 99999; pointer-events: none;
          padding: 150px 220px 52px 48px;
          background: linear-gradient(52deg, rgba(2,10,6,.82) 0%, rgba(2,10,6,.55) 38%, rgba(2,10,6,.22) 62%, transparent 78%);
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          animation: lt-scrim .5s ease both, lt-out .55s ease 3.9s both; }
        #demo-cap .kicker { display: flex; align-items: center; gap: 12px;
          color: #4ade80; font-size: 13.5px; font-weight: 800; letter-spacing: .4em; text-transform: uppercase;
          animation: lt-line .5s cubic-bezier(.16,1,.3,1) .12s both; }
        #demo-cap .kicker::before { content: ''; width: 5px; height: 17px; background: #22c55e;
          box-shadow: 0 0 14px rgba(34,197,94,.8); transform-origin: bottom;
          animation: lt-bar .45s cubic-bezier(.16,1,.3,1) .1s both; }
        #demo-cap .head { color: #fff; font-size: 39px; font-weight: 740; line-height: 1.16;
          letter-spacing: -.02em; max-width: 660px; margin-top: 12px;
          text-shadow: 0 2px 22px rgba(0,0,0,.5);
          animation: lt-line .55s cubic-bezier(.16,1,.3,1) .24s both; }
        @keyframes lt-scrim { from { opacity: 0; } to { opacity: 1; } }
        @keyframes lt-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes lt-line { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes lt-out { to { opacity: 0; transform: translateY(14px); } }
      </style>
      <div class="kicker">${kicker}</div>
      <div class="head">${headline}</div>`
    document.body.appendChild(el)
  }, { kicker, headline })
}

// Spotlight callout: bingkai pulse + label chip di sekitar elemen target (kandidat selector pertama yang ada).
async function callout(page, selectors, label) {
  await page.evaluate(([sels, label]) => {
    document.getElementById('demo-callout')?.remove()
    const el = sels.map(s => document.querySelector(s)).find(Boolean)
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 7
    const box = document.createElement('div')
    box.id = 'demo-callout'
    box.innerHTML = `
      <style>
        #demo-callout { position: fixed; left: ${r.left - pad}px; top: ${r.top - pad}px;
          width: ${r.width + pad * 2}px; height: ${r.height + pad * 2}px; z-index: 99998; pointer-events: none;
          border: 2.5px solid #22c55e; border-radius: 12px;
          box-shadow: 0 0 0 4px rgba(34,197,94,.25), 0 0 30px rgba(34,197,94,.35);
          animation: co-in .45s cubic-bezier(.16,1,.3,1) both, co-pulse 1.6s ease .5s 2, co-out .4s ease 3.4s both; }
        #demo-callout .lbl { position: absolute; left: -2px; top: 100%; margin-top: 10px;
          background: #0c2b1b; color: #fff; font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 14.5px; font-weight: 700; letter-spacing: .02em; padding: 8px 15px; border-radius: 9px;
          border-left: 3px solid #22c55e; box-shadow: 0 10px 28px rgba(0,0,0,.35); white-space: nowrap;
          animation: co-lbl .45s cubic-bezier(.16,1,.3,1) .2s both; }
        @keyframes co-in { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: none; } }
        @keyframes co-pulse { 0%,100% { box-shadow: 0 0 0 4px rgba(34,197,94,.25), 0 0 30px rgba(34,197,94,.35); }
                              50% { box-shadow: 0 0 0 8px rgba(34,197,94,.12), 0 0 44px rgba(34,197,94,.5); } }
        @keyframes co-lbl { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes co-out { to { opacity: 0; } }
      </style>
      <div class="lbl">${label}</div>`
    document.body.appendChild(box)
    setTimeout(() => box.remove(), 4000)
  }, [selectors, label])
}

async function ensureCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return
    const el = document.createElement('div')
    el.id = 'demo-cursor'
    el.innerHTML = `<style>
      #demo-cursor { position: fixed; z-index: 100000; width: 24px; height: 24px; border-radius: 50%;
        background: rgba(34,197,94,.2); border: 2px solid rgba(22,163,74,.9); pointer-events: none;
        transform: translate(-50%,-50%); left: -100px; top: -100px;
        box-shadow: 0 0 0 3px rgba(34,197,94,.12), 0 2px 8px rgba(0,0,0,.18); }
      .demo-ripple { position: fixed; z-index: 99999; width: 10px; height: 10px; border-radius: 50%;
        border: 2px solid rgba(34,197,94,.85); pointer-events: none; transform: translate(-50%,-50%);
        animation: demoRipple .5s ease-out forwards; }
      @keyframes demoRipple { to { width: 54px; height: 54px; opacity: 0; } }
    </style>`
    document.body.appendChild(el)
    window.addEventListener('mousemove', e => { el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px' }, { passive: true })
    window.__demoRipple = (x, y) => {
      const r = document.createElement('div')
      r.className = 'demo-ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'
      document.body.appendChild(r); setTimeout(() => r.remove(), 600)
    }
  })
}

async function glide(page, x, y, ms = 420) {
  const steps = Math.max(10, Math.round(ms / 16))
  const cur = await page.evaluate(() => {
    const el = document.getElementById('demo-cursor')
    return el ? [parseFloat(el.style.left) || 960, parseFloat(el.style.top) || 540] : [960, 540]
  })
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = 1 - Math.pow(1 - t, 3)
    await page.mouse.move(cur[0] + (x - cur[0]) * e, cur[1] + (y - cur[1]) * e)
    await page.waitForTimeout(13)
  }
}

async function clickWithCursor(page, locator, ms = 420) {
  const box = await locator.boundingBox({ timeout: 4000 }).catch(() => null)
  if (!box) { console.warn('clickWithCursor: target not found'); return false }
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await glide(page, cx, cy, ms)
  await page.evaluate(([x, y]) => window.__demoRipple?.(x, y), [cx, cy])
  await page.waitForTimeout(90)
  await locator.click()
  return true
}

async function smoothScroll(page, to, ms = 1100, sel = '.workspace__content') {
  await page.evaluate(([sel, to, ms]) => new Promise(res => {
    const el = document.querySelector(sel)
    if (!el) return res(null)
    const from = el.scrollTop, start = performance.now()
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const step = now => {
      const p = Math.min(1, (now - start) / ms)
      el.scrollTop = from + (to - from) * ease(p)
      p < 1 ? requestAnimationFrame(step) : res(null)
    }
    requestAnimationFrame(step)
  }), [sel, to, ms])
}

async function pushIn(page, sel = '.workspace__content > *', scale = 1.018, ms = 8000) {
  await page.evaluate(([sel, scale, ms]) => {
    const el = document.querySelector(sel)
    if (!el) return
    el.style.transformOrigin = '50% 28%'
    el.style.transition = `transform ${ms}ms ease-out`
    requestAnimationFrame(() => { el.style.transform = `scale(${scale})` })
  }, [sel, scale, ms])
}

function brandHtml(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body { margin:0; width:100%; height:100%; overflow:hidden; }
    body { background: linear-gradient(138deg, #03130b 0%, #07271a 52%, #0b3b24 100%);
           font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
           display:flex; align-items:center; justify-content:center; color:#fff; position:relative; }
    body::before { content:''; position:absolute; inset:-22%;
      background: radial-gradient(1000px 640px at 70% 22%, rgba(34,197,94,.20), transparent 58%);
      animation: bgdrift 15s ease-in-out infinite alternate; }
    .stage { position:relative; z-index:1; }
    .fadeup { opacity:0; transform: translateY(22px); animation: fu .8s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes fu { to { opacity:1; transform:none; } }
    @keyframes bgdrift { from { transform: translate(-2%,-1.5%) scale(1); } to { transform: translate(2.5%,2%) scale(1.08); } }
  </style></head><body><div class="stage">${inner}</div></body></html>`
}

async function brandPage(page, html) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(h => { document.open(); document.write(h); document.close() }, html)
  await page.waitForTimeout(350)
}

function stingHtml(num, word, sub) {
  return brandHtml(`
    <style>
      .bignum { position:fixed; left:50%; top:50%; transform:translate(-50%,-54%); z-index:0;
        font-size:560px; font-weight:800; line-height:1; color:transparent;
        -webkit-text-stroke: 2.5px rgba(74,222,128,.13); letter-spacing:.02em;
        animation: numgrow 1.9s ease-out both; }
      @keyframes numgrow { from { opacity:0; transform:translate(-50%,-54%) scale(.95); }
                           to { opacity:1; transform:translate(-50%,-54%) scale(1.05); } }
    </style>
    <div class="bignum">${num}</div>
    <div style="text-align:center; position:relative; z-index:1;">
      <div class="fadeup" style="font-size:15px; letter-spacing:.5em; color:#4ade80; font-weight:700;">${num}</div>
      <div class="fadeup" style="animation-delay:.08s; font-size:132px; font-weight:800; letter-spacing:.18em; margin:10px 0 4px; text-indent:.18em;">${word}</div>
      <div class="fadeup" style="animation-delay:.2s; font-size:19px; color:rgba(255,255,255,.66); letter-spacing:.08em;">${sub}</div>
    </div>`)
}

// ---------- runner ----------
const manifestPath = `${OUT}/manifest.json`
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : []

async function record(name, run) {
  if (only && !only.some(o => name.startsWith(o))) return
  const page = await ctx.newPage()
  const t0 = Date.now()
  let readyAt = t0
  const markReady = () => { readyAt = Date.now() }
  try {
    await run(page, markReady)
  } catch (e) {
    console.error(`scene ${name} FAILED:`, e.message)
  }
  const video = page.video()
  await page.close()
  const src = await video.path()
  const dst = `${SCENES}/${name}.webm`
  copyFileSync(src, dst)
  const trim = Math.max(0, (readyAt - t0) / 1000 - 0.15)
  const entry = { name, file: dst, trim: Number(trim.toFixed(2)) }
  const i = manifest.findIndex(m => m.name === name)
  i >= 0 ? manifest[i] = entry : manifest.push(entry)
  console.log(`scene ${name}: trim=${trim.toFixed(2)}s`)
}

// ════════ 01 · TITLE ════════
await record('01-title', async (page, ready) => {
  await brandPage(page, brandHtml(`
    <style>
      .title-word { opacity:0; font-size:86px; font-weight:800; margin-top:28px; letter-spacing:.12em; text-indent:.12em;
        animation: fu .8s cubic-bezier(.16,1,.3,1) .2s forwards, spread 5s ease-out .2s forwards; }
      @keyframes spread { from { letter-spacing:.12em; text-indent:.12em; } to { letter-spacing:.18em; text-indent:.18em; } }
      @keyframes sheen { to { transform: translateX(135%); } }
    </style>
    <div style="text-align:center; max-width: 980px;">
      <div class="fadeup" style="position:relative; display:inline-block; border-radius:22px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,.45);">
        <img src="/icons/icon-192.png" style="width:92px; height:92px; display:block;" />
        <i style="position:absolute; inset:0; background:linear-gradient(115deg, transparent 32%, rgba(255,255,255,.38) 50%, transparent 68%); transform:translateX(-135%); animation: sheen 1.5s ease 1.1s forwards;"></i>
      </div>
      <div class="title-word">ATLAS</div>
      <div class="fadeup" style="animation-delay:.4s; font-size:19px; color:rgba(255,255,255,.62); letter-spacing:.04em; margin-top:6px;">Advanced Transformation &amp; Leadership Alignment System</div>
      <div class="fadeup" style="animation-delay:.6s; margin-top:24px; display:inline-block; border-top:1px solid rgba(255,255,255,.18); padding-top:18px; font-size:17px; color:#4ade80;">Work Program &amp; KPI Management Platform — PTPN Group</div>
    </div>`))
  ready()
  await sleep(page, 3400)
})

// ════════ 02 · HOME ════════
await record('02-home', async (page, ready) => {
  await page.goto(`${baseUrl}/`)
  await page.waitForSelector('.hvc__hud', { timeout: 20000 })
  await sleep(page, 900)
  ready()
  await cap(page, 'Home', 'What needs your attention, today')
  await sleep(page, 3400)
  await smoothScroll(page, 620, 1300)
  await sleep(page, 2800)
})

// ════════ 03 · STING PLAN ════════
await record('03-sting-plan', async (page, ready) => {
  await brandPage(page, stingHtml('01', 'PLAN', 'Define the work'))
  ready()
  await sleep(page, 1500)
})

// ════════ 04 · PLAN: Programs → filter → Timeline → ⌘K ════════
await record('04-plan', async (page, ready) => {
  await page.goto(`${baseUrl}/programs`)
  await page.waitForSelector('.programs-filter-chip--red', { timeout: 20000 })
  await sleep(page, 800)
  ready()
  await ensureCursor(page)
  await cap(page, 'Portfolio', 'Slipping programs surface instantly')
  await sleep(page, 1600)
  await clickWithCursor(page, page.locator('button.programs-filter-chip--red'))
  await sleep(page, 1900)
  await clickWithCursor(page, page.locator('button.programs-v2__tab', { hasText: 'Timeline' }))
  await cap(page, 'Portfolio', 'The whole year, mapped')
  await sleep(page, 2400)
  await page.keyboard.press('Meta+k')
  await sleep(page, 500)
  await cap(page, '⌘K', 'Search and jump anywhere')
  await page.keyboard.type('resiliensi', { delay: 60 })
  await page.waitForSelector('div.cmdk-item >> text=Penguatan Business Continuity', { timeout: 10000 }).catch(() => {})
  await sleep(page, 2300)
})

// ════════ 04b · PLAN: detail program (Summary → Schedule gantt) ════════
await record('04b-detail', async (page, ready) => {
  await page.goto(`${baseUrl}/programs/200`)
  await page.waitForSelector('.prog-detail-tab', { timeout: 20000 })
  await sleep(page, 800)
  ready()
  await ensureCursor(page)
  await cap(page, 'Program', 'Structure, schedule, blockers, KPIs')
  await sleep(page, 2000)
  await clickWithCursor(page, page.locator('button.prog-detail-tab', { hasText: 'Schedule' }))
  await sleep(page, 800)
  await cap(page, 'Schedule', 'Plan vs actual, weekly')
  await pushIn(page, '.workspace__content > *', 1.015, 5000)
  await sleep(page, 3400)
})

// ════════ 05 · STING DO ════════
await record('05-sting-do', async (page, ready) => {
  await brandPage(page, stingHtml('02', 'DO', 'Run the week'))
  ready()
  await sleep(page, 1500)
})

// ════════ 06 · DO: Workboard → List → Channels ════════
await record('06-do', async (page, ready) => {
  await page.goto(`${baseUrl}/execution`)
  await page.waitForSelector('.work-card-shell', { timeout: 30000 })
  await sleep(page, 900)
  ready()
  await ensureCursor(page)
  await cap(page, 'Workboard', 'Progress moves the cards')
  await sleep(page, 2400)
  await clickWithCursor(page, page.locator('button.view-toggle-btn', { hasText: 'List' }))
  await sleep(page, 2200)
  await clickWithCursor(page, page.locator('a.sidebar__item', { hasText: 'Channels' }), 550)
  await page.waitForSelector('.channel-row', { timeout: 20000 })
  await sleep(page, 700)
  await clickWithCursor(page, page.locator('button.channel-row', { hasText: 'bcms-koordinasi' }))
  await sleep(page, 1300)
  await cap(page, 'Channels', 'Chat that knows the program')
  await callout(page, ['[class*="program-banner"]', '[class*="linked-program"]', '[class*="channel-banner"]', '[class*="banner"]'], 'Linked program — live health')
  await sleep(page, 3600)
})

// ════════ 07 · STING CHECK ════════
await record('07-sting-check', async (page, ready) => {
  await brandPage(page, stingHtml('03', 'CHECK', 'Read the results'))
  ready()
  await sleep(page, 1500)
})

// ════════ 08 · CHECK: Scorecard ════════
await record('08-scorecard', async (page, ready) => {
  await page.goto(`${baseUrl}/performance/scorecard`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await sleep(page, 1100)
  ready()
  await cap(page, 'Performance', 'KPI health across divisions')
  await pushIn(page, '.workspace__content > *', 1.013, 7000)
  await sleep(page, 4000)
})

// ════════ 08b · CHECK: Division KPI breakdown ════════
await record('08b-division', async (page, ready) => {
  await page.goto(`${baseUrl}/performance/divisi/dimr`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {})
  await sleep(page, 1100)
  ready()
  await cap(page, 'Performance', 'Every division, down to each KPI')
  await pushIn(page, '.workspace__content > *', 1.012, 7500)
  await sleep(page, 3200)
  await smoothScroll(page, 640, 1500)
  await sleep(page, 2800)
})

// ════════ 09 · CHECK: Charter + Export PPTX ════════
await record('09-charter', async (page, ready) => {
  await page.goto(`${baseUrl}/programs/200/charter`)
  await page.waitForSelector('.cs-export', { timeout: 20000 })
  await sleep(page, 900)
  ready()
  await ensureCursor(page)
  await cap(page, 'Charter', 'The DKMR charter, generated live')
  await pushIn(page, '.workspace__content > *', 1.016, 7500)
  await sleep(page, 3600)
  const exp = page.locator('.cs-export')
  const box = await exp.boundingBox({ timeout: 3000 }).catch(() => null)
  if (box) await glide(page, box.x + box.width / 2, box.y + box.height / 2, 550)
  await cap(page, 'Export', 'From live data to slides')
  await callout(page, ['.cs-export'], 'Export PPTX')
  await sleep(page, 3600)
})

// ════════ 10 · STING ACT ════════
await record('10-sting-act', async (page, ready) => {
  await brandPage(page, stingHtml('04', 'ACT', 'Remove the blockers'))
  ready()
  await sleep(page, 1500)
})

// ════════ 11 · ACT: Coordination ════════
await record('11-act', async (page, ready) => {
  await page.goto(`${baseUrl}/jadwal`)
  await page.waitForSelector('text=Rapat Koordinasi Mingguan', { timeout: 20000 })
  await sleep(page, 900)
  ready()
  await ensureCursor(page)
  await cap(page, 'Coordination', 'Decisions and follow-ups, on record')
  await sleep(page, 2600)
  await clickWithCursor(page, page.locator('text=Rapat Koordinasi Mingguan DKMR').first(), 550)
  await sleep(page, 3800)
})

// ════════ 11b · ACT: Clear the Path (Focus triage) ════════
await record('11b-clear', async (page, ready) => {
  await page.goto(`${baseUrl}/fokus`)
  await page.waitForSelector('.collapsible-section__header', { timeout: 20000 })
  await sleep(page, 1000)
  ready()
  await cap(page, 'Clear the Path', 'Escalation with a deadline')
  await sleep(page, 2400)
  await callout(page, ['.hd-act-row--red'], 'Critical blocker — escalated up the chain')
  await sleep(page, 4200)
})

// ════════ 12 · MOBILE / PWA (sebelum dark — ponsel tampil light) ════════
await record('12-mobile', async (page, ready) => {
  await brandPage(page, brandHtml(`
    <div style="display:flex; align-items:center; gap:90px; padding:0 60px;">
      <div style="max-width:520px;">
        <div class="fadeup" style="color:#4ade80; font-size:12px; font-weight:700; letter-spacing:.22em; text-transform:uppercase;">Mobile</div>
        <div class="fadeup" style="animation-delay:.12s; font-size:44px; font-weight:700; line-height:1.18; margin-top:14px;">From the boardroom to the field</div>
        <div class="fadeup" style="animation-delay:.24s; font-size:18px; color:rgba(255,255,255,.7); line-height:1.55; margin-top:18px;">
          Fully responsive down to the phone — installable as an app (PWA), with bottom navigation built for touch.</div>
      </div>
      <div style="display:flex; gap:34px; align-items:center;">
        <div class="fadeup" style="animation-delay:.3s; width:344px; height:716px; border-radius:46px; padding:10px; background:#0b0f0d; box-shadow:0 30px 80px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.08);">
          <iframe src="/" style="width:324px; height:696px; border:0; border-radius:38px; background:#fff;"></iframe>
        </div>
        <div class="fadeup" style="animation-delay:.45s; width:344px; height:716px; border-radius:46px; padding:10px; background:#0b0f0d; box-shadow:0 30px 80px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.08); transform:translateY(34px);">
          <iframe src="/execution" style="width:324px; height:696px; border:0; border-radius:38px; background:#fff;"></iframe>
        </div>
      </div>
    </div>`))
  await sleep(page, 4200)
  ready()
  // tap-ripple ala demo App Store di kedua ponsel (pointerdown → lingkaran memudar)
  await page.evaluate(() => {
    document.querySelectorAll('iframe').forEach(f => {
      try {
        const doc = f.contentDocument
        if (!doc || doc.getElementById('demo-tap-style')) return
        const st = doc.createElement('style')
        st.id = 'demo-tap-style'
        st.textContent = `.demo-tap { position: fixed; z-index: 100000; width: 14px; height: 14px; border-radius: 50%;
          background: rgba(34,197,94,.45); border: 2px solid rgba(22,163,74,.9); pointer-events: none;
          transform: translate(-50%,-50%); animation: demoTap .55s ease-out forwards; }
          @keyframes demoTap { to { width: 58px; height: 58px; opacity: 0; } }`
        doc.head.appendChild(st)
        doc.addEventListener('pointerdown', e => {
          const r = doc.createElement('div')
          r.className = 'demo-tap'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'
          doc.body.appendChild(r); setTimeout(() => r.remove(), 700)
        }, true)
      } catch {}
    })
  })
  const phone1 = page.frameLocator('iframe').first()
  const innerScroll = (idx, to, ms) => page.evaluate(([idx, to, ms]) => {
    const f = document.querySelectorAll('iframe')[idx]
    try {
      const el = f.contentDocument?.querySelector('.workspace__content')
      if (!el) return
      const start = performance.now(), from = el.scrollTop
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const step = now => { const p = Math.min(1, (now - start) / ms); el.scrollTop = from + (to - from) * ease(p); if (p < 1) requestAnimationFrame(step) }
      requestAnimationFrame(step)
    } catch {}
  }, [idx, to, ms])
  // Ponsel kanan (Workboard): lompati kolom kosong "Not Started", lalu scroll kontinu
  // menyusuri kartu In Progress sepanjang scene — bergerak BERSAMAAN dengan journey kiri.
  await innerScroll(1, 480, 800)
  await sleep(page, 600)
  await innerScroll(1, 2100, 10500)
  // 1 — ponsel kiri: scroll Home (bersamaan dgn kanan)
  await innerScroll(0, 460, 1500)
  await sleep(page, 2000)
  // 2 — ponsel kiri: tab Channels → buka chat BCMS
  await phone1.locator('.mobile-tabbar__item', { hasText: 'Channels' }).click({ timeout: 5000 }).catch(e => console.warn('tab channels:', e.message))
  await sleep(page, 1500)
  await phone1.locator('button.channel-row', { hasText: 'bcms-koordinasi' }).click({ timeout: 5000 }).catch(e => console.warn('bcms row:', e.message))
  await sleep(page, 2700)
  // 3 — ponsel kiri: buka drawer via tab Menu
  await phone1.locator('.mobile-tabbar__item', { hasText: 'Menu' }).click({ timeout: 5000 }).catch(e => console.warn('menu tab:', e.message))
  await sleep(page, 3000)
})

// ════════ 13 · DARK MODE (terakhir — menutup gelap ke closing card) ════════
await record('13-dark', async (page, ready) => {
  await page.goto(`${baseUrl}/programs`)
  await page.waitForSelector('.programs-filter-chip--red', { timeout: 20000 })
  await sleep(page, 800)
  ready()
  await ensureCursor(page)
  await cap(page, 'Themes', 'Light or dark')
  await sleep(page, 1300)
  await clickWithCursor(page, page.locator('button.sidebar__util-btn[title="Dark mode"]'), 600)
  await sleep(page, 2300)
  await smoothScroll(page, 320, 1100)
  await sleep(page, 2000)
})

// ════════ 14 · CLOSING ════════
await record('14-closing', async (page, ready) => {
  await brandPage(page, brandHtml(`
    <div style="text-align:center; max-width: 980px;">
      <img src="/icons/icon-192.png" class="fadeup" style="width:72px; height:72px; border-radius:18px; box-shadow:0 20px 60px rgba(0,0,0,.45);" />
      <div class="fadeup" style="animation-delay:.15s; font-size:56px; font-weight:800; letter-spacing:.14em; margin-top:22px;">ATLAS</div>
      <div class="fadeup" style="animation-delay:.32s; font-size:20px; color:rgba(255,255,255,.7); margin-top:14px; letter-spacing:.3em; text-transform:uppercase;">Plan&nbsp;&nbsp;·&nbsp;&nbsp;Do&nbsp;&nbsp;·&nbsp;&nbsp;Check&nbsp;&nbsp;·&nbsp;&nbsp;Act</div>
      <div class="fadeup" style="animation-delay:.5s; margin-top:28px; font-size:18px; color:#4ade80;">atlas.ptpn.id</div>
    </div>`))
  ready()
  await sleep(page, 4300)
})

await ctx.close()
await browser.close()
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log('RECORD DONE —', manifest.length, 'scenes')
