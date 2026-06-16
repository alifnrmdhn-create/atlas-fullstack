// Probe v2: palette ⌘K, channels, theme toggle, /jadwal, Programs Timeline tab.
import { chromium } from 'playwright-core'
const baseUrl = 'http://localhost:9000'
const OUT = '/tmp/atlas-video/frames'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars'] })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'light' })
const page = await ctx.newPage()
await page.goto(`${baseUrl}/login`)
await page.fill('#identifier', 'bod_kmr@ptpn')
await page.fill('#password', 'Password123!')
await page.click('button[type="submit"]')
await page.waitForSelector('.app-shell', { timeout: 15000 })
await page.evaluate(() => localStorage.setItem('atlas.theme', 'light'))

// 1. Programs Timeline tab
await page.goto(`${baseUrl}/programs`)
await page.waitForSelector('.programs-v2__tab', { timeout: 15000 })
await page.locator('button.programs-v2__tab', { hasText: 'Timeline' }).click()
await page.waitForTimeout(2200)
await page.screenshot({ path: `${OUT}/p2-timeline.png` })

// 2. ⌘K palette + ketik + hasil
await page.keyboard.press('Meta+k')
await page.waitForTimeout(700)
await page.keyboard.type('resiliensi', { delay: 70 })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${OUT}/p2-palette.png` })
const palInfo = await page.evaluate(() => {
  const pick = els => [...els].slice(0, 8).map(e => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} «${(e.textContent || '').trim().slice(0, 50)}»`)
  return pick(document.querySelectorAll('[cmdk-item], [role="option"], [class*="palette"] [class*="item"]'))
})
console.log('palette items:', JSON.stringify(palInfo, null, 1))
await page.keyboard.press('Escape')

// 3. Channels
await page.goto(`${baseUrl}/channels`)
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/p2-channels.png` })
const chInfo = await page.evaluate(() => {
  const pick = (els, n = 12) => [...els].slice(0, n).map(e => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')} «${(e.textContent || '').trim().slice(0, 40)}»`)
  return {
    channels: pick(document.querySelectorAll('[class*="channel-list"] button, [class*="channel"][class*="item"], aside button'), 16),
    messages: document.querySelectorAll('[class*="message-card"]').length,
    sidebarNav: pick(document.querySelectorAll('.sidebar a, .sidebar button'), 20),
  }
})
console.log('channels:', JSON.stringify(chInfo, null, 1).slice(0, 1800))

// 4. /jadwal (Coordination)
await page.goto(`${baseUrl}/jadwal`)
await page.waitForTimeout(3000)
await page.screenshot({ path: `${OUT}/p2-jadwal.png` })

// 5. theme toggle di sidebar footer
const toggleInfo = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.sidebar button, .sidebar a')]
  return els.map(e => `${e.tagName.toLowerCase()} class="${e.className}" title="${e.title || e.getAttribute('aria-label') || ''}"`).slice(-6)
})
console.log('sidebar footer btns:', JSON.stringify(toggleInfo, null, 1))
await page.locator('button.sidebar__util-btn').last().click().catch(e => console.log('toggle click fail', e.message))
await page.waitForTimeout(1600)
await page.screenshot({ path: `${OUT}/p2-after-toggle.png` })

await browser.close()
console.log('PROBE2 DONE')
