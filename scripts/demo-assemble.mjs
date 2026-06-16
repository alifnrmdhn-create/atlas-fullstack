// Rakit scene webm → atlas-demo.mp4 (trim per manifest, xfade 0.5s, H.264 1080p30).
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const FF = '/opt/homebrew/bin/ffmpeg'
const FP = '/opt/homebrew/bin/ffprobe'
const OUT = '/tmp/atlas-video'
const FADE = 0.35
const OW = parseInt(process.env.OUT_W ?? '3840', 10)
const OH = parseInt(process.env.OUT_H ?? '2160', 10)

const manifest = JSON.parse(readFileSync(`${OUT}/manifest.json`, 'utf8'))
  .sort((a, b) => a.name.localeCompare(b.name))

// Klip UI dipercepat sedikit (rasa gesit ala product reel); brand card tetap 1×.
const isBrand = n => /title|sting|closing/.test(n)
const SPEED = 1.25

// Beat grid: musik delay 1 dtk; BPM 191.57 (8th-note grid) fase 0.026 — cut di-snap ke beat
// dengan micro-tuning speed per klip (batas per jenis klip; brand boleh ±7%).
const PERIOD = 60 / 191.57
const PHASE = 1.0 + 0.026
const beatAt = (t, fn) => PHASE + fn((t - PHASE) / PERIOD) * PERIOD

const clips = manifest.map(s => {
  const dur = parseFloat(execSync(`${FP} -v error -show_entries format=duration -of csv=p=0 "${s.file}"`).toString())
  const base = isBrand(s.name) ? 1 : s.name.includes('mobile') ? 1.38 : SPEED
  const [lo, hi] = isBrand(s.name) ? [0.95, 1.1] : s.name.includes('mobile') ? [1.3, 1.46] : [1.18, 1.33]
  return { ...s, raw: dur - s.trim, base, lo, hi }
})

// pilih speed tiap klip agar titik-tengah crossfade berikutnya jatuh di beat
let run = 0
for (let i = 0; i < clips.length; i++) {
  const c = clips[i]
  const effBase = c.raw / c.base
  const cutBase = run + effBase - FADE / 2
  let speed = c.base
  for (const fn of [Math.floor, Math.round, Math.ceil]) {
    const eff = beatAt(cutBase, fn) - run + FADE / 2
    const sp = c.raw / eff
    if (sp >= c.lo && sp <= c.hi) { speed = sp; break }
  }
  c.speed = Math.round(speed * 10000) / 10000
  c.eff = c.raw / c.speed
  run += c.eff - FADE
  console.log(`${c.name}: speed=${c.speed} cut@${(run + FADE / 2).toFixed(2)}s`)
}

const inputs = clips.map(c => `-i "${c.file}"`).join(' ')
const norm = clips.map((c, i) => {
  const grade = isBrand(c.name) ? '' : ',eq=contrast=1.03:saturation=1.05,vignette=a=PI/8'
  return `[${i}:v]trim=start=${c.trim},setpts=(PTS-STARTPTS)/${c.speed},fps=30,scale=${OW}:${OH}:flags=lanczos,setsar=1,format=yuv420p${grade}${i === 0 ? ',fade=t=in:st=0:d=0.45' : ''}[v${i}]`
})

const chain = []
let acc = clips[0].eff
let prev = 'v0'
for (let i = 1; i < clips.length; i++) {
  const off = (acc - FADE).toFixed(3)
  chain.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${off}[x${i}]`)
  acc = acc - FADE + clips[i].eff
  prev = `x${i}`
}
chain.push(`[${prev}]fade=t=out:st=${(acc - 0.55).toFixed(3)}:d=0.55[vout]`)

// Musik latar opsional: MUSIC=/path/track.mp3 — trim ke durasi video, fade in/out.
const music = process.env.MUSIC
const audioIn = music ? ` -i "${music}"` : ''
const audioFilter = music
  ? `;[${clips.length}:a]atrim=0:${(acc - 1).toFixed(3)},afade=t=in:st=0:d=1,adelay=1000|1000,afade=t=out:st=${(acc - 3).toFixed(3)}:d=3,volume=0.72[aout]`
  : ''
const audioMap = music ? ` -map "[aout]" -c:a aac -b:a 192k` : ''

const filter = [...norm, ...chain].join(';') + audioFilter
const cmd = `${FF} -y -v warning ${inputs}${audioIn} -filter_complex "${filter}" -map "[vout]"${audioMap} ` +
  `-c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -movflags +faststart "${OUT}/atlas-demo.mp4"`

console.log('final duration ≈', acc.toFixed(1) + 's', music ? '(with music)' : '(silent)')
execSync(cmd, { stdio: 'inherit' })
console.log('ASSEMBLED →', `${OUT}/atlas-demo.mp4`)
