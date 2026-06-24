// Diagnostik dark-mode: di halaman tertentu (theme dark), temukan elemen dgn
// background/teks TERANG yang tak semestinya, laporkan selector + nilai computed.
// Jalankan: PROBE_PATHS=/execution,/playbook node scripts/darkmode-probe.mjs
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const baseUrl = process.env.APP_URL ?? 'http://localhost:9000'
const chromeBin = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loginId = process.env.SMOKE_LOGIN_ID ?? 'bod_kmr@ptpn'
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD ?? 'DKMR2026'
const paths = (process.env.PROBE_PATHS ?? '/execution,/playbook').split(',')

const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-chrome-'))
const chrome = spawn(chromeBin, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-dev-shm-usage', '--window-size=1600,1200', '--force-device-scale-factor=1',
  '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })
let stderr = ''
try {
  const ws = await waitForDevToolsEndpoint(chrome)
  const port = new URL(ws).port
  const target = await createTarget(port)
  const page = await connectCDP(target.webSocketDebuggerUrl)
  await page.send('Page.enable'); await page.send('Runtime.enable')
  await navigate(page, `${baseUrl}/login`)
  await waitFor(page, () => document.querySelector('#identifier'), 10000, 'login')
  await typeInput(page, '#identifier', loginId); await typeInput(page, '#password', loginPassword)
  await page.send('Runtime.evaluate', { expression: `document.querySelector('button[type="submit"]')?.click()` })
  await waitFor(page, () => document.querySelector('.app-shell'), 15000, 'shell')
  await page.send('Runtime.evaluate', { expression: `localStorage.setItem('atlas.theme','dark')` })

  for (const p of paths) {
    await navigate(page, `${baseUrl}${p}`)
    await sleep(2600)
    const probe = `(() => {
      const out = []
      const parse = (c) => { const m = c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/); if(!m) return null; return { r:+m[1], g:+m[2], b:+m[3], a:m[4]===undefined?1:+m[4] } }
      const isLight = (c, thr=200, minA=0.5) => { const p=parse(c); if(!p) return false; if(p.a<minA) return false; return p.r>thr && p.g>thr && p.b>thr }
      for (const el of document.querySelectorAll('.app-shell *, svg *')) {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect()
        if (r.width < 24 || r.height < 12) continue
        const tag = el.tagName.toLowerCase()
        const cls = (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '').split(/\\s+/).slice(0,3).join('.')
        if (isLight(s.backgroundColor)) out.push('BG    '+tag+'.'+cls+'  ['+s.backgroundColor+']  '+Math.round(r.width)+'x'+Math.round(r.height))
        if (tag !== 'svg' && isLight(s.fill) && s.fill !== 'none') out.push('FILL  '+tag+'.'+cls+'  ['+s.fill+']')
        // border terang & tegas (alpha tinggi, hampir putih) pada elemen besar = outline kartu salah
        if (r.width > 60 && r.height > 30) {
          const bw = parseFloat(s.borderTopWidth)||0
          if (bw > 0 && isLight(s.borderTopColor, 200, 0.6)) out.push('BORDER '+tag+'.'+cls+'  ['+s.borderTopColor+' '+s.borderTopWidth+']  '+Math.round(r.width)+'x'+Math.round(r.height))
        }
      }
      const seen = new Set(); return out.filter(x=>{const k=x.replace(/\\d+x\\d+/,'');if(seen.has(k))return false;seen.add(k);return true}).slice(0,40)
    })()`
    const r = await page.send('Runtime.evaluate', { expression: probe, returnByValue: true })
    console.log('\\n===== ' + p + ' (dark) — elemen terang mencurigakan =====')
    const list = r.result?.value ?? []
    if (!list.length) console.log('  (bersih)')
    for (const l of list) console.log('  ' + l)
  }
} catch (e) { console.error('PROBE GAGAL:', e.message); process.exitCode = 1 } finally { chrome.kill() }

async function waitForDevToolsEndpoint(proc){return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('no DevTools\n'+stderr)),10000);proc.stderr.on('data',c=>{stderr+=c;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(t);res(m[1])}});proc.on('exit',c=>{clearTimeout(t);rej(new Error('exit '+c))})})}
async function createTarget(port){const r=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'});if(!r.ok)throw new Error('target '+r.status);return r.json()}
function connectCDP(wsUrl){const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();ws.addEventListener('message',m=>{const p=JSON.parse(m.data);if(p.id&&pending.has(p.id)){const{resolve,reject}=pending.get(p.id);pending.delete(p.id);p.error?reject(new Error(p.error.message)):resolve(p.result)}});return new Promise((res,rej)=>{ws.addEventListener('open',()=>res({send(method,params={}){const rid=++id;ws.send(JSON.stringify({id:rid,method,params}));return new Promise((rs,rj)=>{const t=setTimeout(()=>rj(new Error('timeout '+method)),20000);pending.set(rid,{resolve:v=>{clearTimeout(t);rs(v)},reject:rj})})}}));ws.addEventListener('error',rej)})}
async function navigate(page,url){await page.send('Page.navigate',{url});await sleep(1200)}
async function waitFor(page,pred,ms,label){const s=Date.now();while(Date.now()-s<ms){const r=await page.send('Runtime.evaluate',{expression:`Boolean((${pred.toString()})())`,returnByValue:true});if(r.result?.value)return;await sleep(150)}throw new Error('timeout '+label)}
async function typeInput(page,sel,val){await page.send('Runtime.evaluate',{expression:`(()=>{const i=document.querySelector(${JSON.stringify(sel)});const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,${JSON.stringify(val)});i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()`})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
