import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import mermaid from 'mermaid'
import i18n from '../lib/i18n'
import './PlaybookView.css'
import './SmallPagesViews.css'

// ── Markdown parser ───────────────────────────────────────────────────────────

function esc(s: string) {
  // Preserve named HTML entities (e.g. &nbsp;) before escaping bare ampersands
  return s
    .replace(/&([a-zA-Z]+|#\d+|#x[\da-fA-F]+);/g, '\x00$1\x01')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // eslint-disable-next-line no-control-regex -- \x00/\x01 sentinel placeholder entity (disengaja)
    .replace(/\x00([^\x01]*)\x01/g, '&$1;')
}

function inl(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code class="pb-ic">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="pb-a" href="$2" target="_blank" rel="noopener">$1</a>')
    // Replace status emoji circles with CSS-rendered dots so size & color
    // stay crisp across OS/font (Apple vs Windows vs Linux emoji renderers
    // size & shade these differently). Source markdown keeps the emoji for
    // plain-text readability — only render output uses the span.
    .replace(/🟢/g, '<span class="pb-dot pb-dot--green" aria-hidden="true"></span>')
    .replace(/🟡/g, '<span class="pb-dot pb-dot--amber" aria-hidden="true"></span>')
    .replace(/🔴/g, '<span class="pb-dot pb-dot--red" aria-hidden="true"></span>')
    .replace(/🔵/g, '<span class="pb-dot pb-dot--blue" aria-hidden="true"></span>')
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')
}

function tableHtml(lines: string[]): string {
  const rows = lines.filter(l => !l.match(/^\|[-:| ]+\|$/))
  if (!rows.length) return ''
  const cells = (r: string) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
  const [head, ...body] = rows
  return (
    `<div class="pb-table-wrap"><table class="pb-table">` +
    `<thead><tr>${cells(head).map(c => `<th>${inl(c)}</th>`).join('')}</tr></thead>` +
    `<tbody>${body.map(r => `<tr>${cells(r).map(c => `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</tbody>` +
    `</table></div>`
  )
}

function statusClass(line: string): string {
  if (line.includes('❌')) return 'pb-status pb-status--red'
  if (line.includes('⚠️')) return 'pb-status pb-status--amber'
  if (line.includes('✅')) return 'pb-status pb-status--green'
  return 'pb-status'
}

type TocEntry = { id: string; label: string; num: number | null }
type TocGroup = { label: string; items: TocEntry[] }
type ParseResult = { html: string; toc: TocEntry[]; h1: string; mermaidSources: string[]; updatedAt: string | null }

// Map section number → top-level group label.
// Mirrors ATLAS sidebar's PDCA structure (Plan/Do/Check/Act + Komunikasi/Akun/Admin)
// so playbook navigation matches the product navigation it documents.
function pdcaGroup(num: number | null): string {
  if (num === null) return i18n.t('Get Started')      // preamble: Referensi Jabatan, Glosarium, Alur Proses
  if (num <= 2) return i18n.t('Get Started')          // 1. Auth, 2. Navigasi Sidebar
  if (num <= 4) return i18n.t('Today')                // 3. Home, 4. Fokus
  if (num <= 7) return i18n.t('Planning')             // 5-7. Program, Charter, Roadmap
  if (num <= 11) return i18n.t('Execution')           // 8-11. Workboard, Penugasan, Grid, Blocker
  if (num <= 16) return i18n.t('Performance')         // 12-16. Executive, Scorecard, KPI ×3
  if (num <= 18) return i18n.t('Follow-up')           // 17. Rapat, 18. Eskalasi
  if (num <= 21) return i18n.t('Communication & Account')   // 19. Channels, 20. Akun, 21. Search
  return i18n.t('Appendix')                            // 22. Admin, 23. Evaluasi
}

function groupToc(toc: TocEntry[]): TocGroup[] {
  return toc.reduce<TocGroup[]>((acc, item) => {
    const label = pdcaGroup(item.num)
    const last = acc[acc.length - 1]
    if (last && last.label === label) last.items.push(item)
    else acc.push({ label, items: [item] })
    return acc
  }, [])
}

function parse(md: string): ParseResult {
  const lines = md.split('\n')
  const out: string[] = []
  const toc: TocEntry[] = []
  const mermaidSources: string[] = []
  let h1 = ''
  let i = 0
  let inSection = false
  let inIntro = false

  while (i < lines.length) {
    const ln = lines[i]

    // Code fence
    if (ln.startsWith('```')) {
      const lang = ln.slice(3).trim()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i++ }
      if (lang === 'mermaid') {
        // Use a placeholder — replaced by React's MermaidDiagram component at render time
        const idx = mermaidSources.length
        mermaidSources.push(code.join('\n'))
        out.push(`\x00MERMAID:${idx}\x00`)
      } else {
        const langSpan = lang ? `<span class="pb-lang">${lang}</span>` : ''
        out.push(`<pre class="pb-pre">${langSpan}<code>${code.map(esc).join('\n')}</code></pre>`)
      }
      i++; continue
    }

    // HR
    if (/^---+$/.test(ln.trim())) { out.push('<hr class="pb-hr">'); i++; continue }

    // "Siapa yang bisa:" role bar
    if (/^\*\*Siapa yang bisa/.test(ln)) {
      const content = ln.replace(/^\*\*Siapa yang bisa:\*\*\s*/, '')
      out.push(`<div class="pb-who"><span class="pb-who__label">${i18n.t('Who can:')}</span><span class="pb-who__roles">${inl(content)}</span></div>`)
      i++; continue
    }

    // Blockquote
    if (ln.startsWith('> ') || ln.trim() === '>') {
      if (!inSection && !inIntro) { out.push('<div class="pb-intro">'); inIntro = true }
      const paras: string[] = []
      let cur: string[] = []
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i].trim() === '>')) {
        if (lines[i].trim() === '>') {
          if (cur.length) { paras.push(`<p>${inl(cur.join(' '))}</p>`); cur = [] }
        } else {
          cur.push(lines[i].slice(2))
        }
        i++
      }
      if (cur.length) paras.push(`<p>${inl(cur.join(' '))}</p>`)
      const joined = paras.join('')
      const isTechNote = joined.includes('🔧')
      const isTip = joined.includes('💡')
      const bqClass = isTechNote ? 'pb-bq pb-bq--tech' : isTip ? 'pb-bq' : 'pb-bq pb-bq--neutral'
      out.push(`<blockquote class="${bqClass}">${joined}</blockquote>`)
      continue
    }

    // Status badge line
    if (/^\*\*Status[:\s]/.test(ln)) {
      if (!inSection && !inIntro) { out.push('<div class="pb-intro">'); inIntro = true }
      const badgeText = ln.replace(/^\*\*Status[:\s]*\*\*\s*/, '').trim()
      out.push(`<div class="${statusClass(ln)}">${inl(badgeText)}</div>`)
      i++; continue
    }

    // Heading
    const hm = ln.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      const lv = hm[1].length
      const id = slug(hm[2].replace(/[*`[\]]/g, ''))
      if (lv === 1) {
        h1 = hm[2].replace(/[*`[\]]/g, '').trim()
        i++; continue
      }
      if (lv === 2) {
        // Close intro wrapper if still open
        if (inIntro) { out.push('</div>'); inIntro = false }
        // Close previous section, open new one
        if (inSection) out.push('</section>')
        const numMatch = hm[2].match(/^(\d+)\.\s+/)
        out.push(`<section class="pb-section${numMatch ? '' : ' pb-section--ref'}">`)
        inSection = true
        const clean = hm[2].replace(/[*`[\]#]/g, '').replace(/^\d+\.\s+/, '').trim()
        toc.push({ id, label: clean, num: numMatch ? parseInt(numMatch[1], 10) : null })
      }
      // Add copy-link affordance to H2/H3 only — deeper headings are too dense
      // to warrant per-heading anchors, and the topbar/TOC already cover H2.
      const anchor = (lv === 2 || lv === 3)
        ? `<button type="button" class="pb-anchor" data-anchor="${id}" aria-label="${i18n.t('Copy link to this section')}" title="${i18n.t('Copy link')}"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M5 7a2.5 2.5 0 0 0 3.5 0l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L5.5 3"/><path d="M7 5a2.5 2.5 0 0 0-3.5 0L2 6.5a2.5 2.5 0 0 0 3.5 3.5L6.5 9"/></svg></button>`
        : ''
      out.push(`<h${lv} class="pb-h${lv}" id="${id}">${inl(hm[2])}${anchor}</h${lv}>`)
      i++; continue
    }

    // Table
    if (ln.startsWith('|')) {
      const tbl: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tbl.push(lines[i]); i++ }
      out.push(tableHtml(tbl)); continue
    }

    // Ordered list
    if (/^\d+\.\s/.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      out.push(`<ol class="pb-ol">${items.map(it => `<li>${inl(it)}</li>`).join('')}</ol>`)
      continue
    }

    // Unordered list
    if (/^[-*] /.test(ln)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++ }
      out.push(`<ul class="pb-ul">${items.map(it => `<li>${inl(it)}</li>`).join('')}</ul>`)
      continue
    }

    if (ln.trim() === '') { i++; continue }

    out.push(`<p class="pb-p">${inl(ln)}</p>`)
    i++
  }

  if (inIntro) out.push('</div>')
  if (inSection) out.push('</section>')

  // Extract "Diperbarui" date from the footer line. Pattern matches Indonesian
  // dates like "18 Mei 2026" or "8 Mei 2026" appearing after "per ".
  const dateMatch = md.match(/per\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/)
  const updatedAt = dateMatch ? dateMatch[1] : null

  return { html: out.join('\n'), toc, h1, mermaidSources, updatedAt }
}

// ── Mermaid ───────────────────────────────────────────────────────────────────

// System fonts only — eliminates the web-font load race that previously caused
// mermaid to measure node text with fallback metrics, leaving rects narrower
// than the rendered glyphs. system-ui is always available so measurement and
// paint use the same font.
const MERMAID_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Theme-aware base variables. Mermaid bakes concrete colors into the SVG at
// render time (it can't read CSS var() later), so we feed it the resolved
// palette per theme and re-render when the theme flips. Values mirror the
// `--surface-*/--text-*/--*` tokens for light & dark in tokens.css.
const MERMAID_VARS = {
  light: {
    primaryColor: '#ffffff', primaryBorderColor: '#2d6a4f', primaryTextColor: '#1a1a1a',
    lineColor: '#6b7280', edgeLabelBackground: '#f8faf8',
    nodeBorder: '#2d6a4f', clusterBkg: '#f0f7f0', titleColor: '#1a1a1a', edgeColor: '#6b7280',
  },
  dark: {
    primaryColor: '#1C1C21', primaryBorderColor: '#2E8B4E', primaryTextColor: '#E2E8F0',
    lineColor: '#7A8CA6', edgeLabelBackground: '#16161A',
    nodeBorder: '#2E8B4E', clusterBkg: '#16161A', titleColor: '#E2E8F0', edgeColor: '#7A8CA6',
  },
} as const

function initMermaid(theme: 'light' | 'dark') {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: { ...MERMAID_VARS[theme], fontFamily: MERMAID_FONT, fontSize: '12.5px' },
    // htmlLabels=false → SVG <text> + getBBox for accurate label measurement.
    // CSS rule `.pb-mermaid svg text { font-size: 12.5px; ... }` in PlaybookView.css
    // isolates rendered text from the .pb-body cascade so it matches mermaid's
    // offscreen measurement (root-cause fix for clipping).
    flowchart: { curve: 'basis', padding: 12, useMaxWidth: true, htmlLabels: false, nodeSpacing: 36, rankSpacing: 44 },
  })
}
initMermaid('light')

// classDef fills in ATLAS_PLAYBOOK.md are authored as LIGHT tints (white / amber-200
// / red-200 / purple-200 / slate). themeVariables can't override classDef, so for
// dark mode we rewrite the source: map each light fill → a dark-tinted equivalent
// and flip its dark label color → a light ink. Solid status fills (e.g. #dc2626 with
// white text) already read on dark and are left alone.
// fill:#light → dark-tinted surface. Covers every light classDef fill in
// ATLAS_PLAYBOOK.md. Solid/dark status fills (#dc2626, #15803d, #166534,
// #1e3a2f, #4ade80) already read on dark and are intentionally kept.
const MERMAID_FILL_MAP: Record<string, string> = {
  '#ffffff': '#1C1C21', '#f0f7f0': '#16221A',
  '#e2e8f0': '#1C2333', '#cbd5e1': '#1C2333',
  '#fde68a': '#3A2E10', '#fed7aa': '#3A2410',
  '#fecaca': '#3A1518', '#ddd6fe': '#241C3A',
  '#bfdbfe': '#15233A', '#bbf7d0': '#14321F', '#4ade80': '#16321E',
}
// color:#darkInk → light ink (authored for light tints). White text (on solid
// fills like #dc2626/#15803d) is kept white.
const MERMAID_INK_MAP: Record<string, string> = {
  '#0f172a': '#E2E8F0', '#1a1a1a': '#E2E8F0', '#1e293b': '#C3D0DE', '#475569': '#C3D0DE',
  '#451a03': '#FCD34D', '#7c2d12': '#FDBA74', '#7f1d1d': '#FCA5A5', '#4c1d95': '#C4B5FD',
  '#14532d': '#86EFAC', '#1e3a8a': '#BFDBFE', '#1e40af': '#BFDBFE',
}

function adaptMermaidForDark(source: string): string {
  // Only touch classDef lines so node/edge geometry & labels stay intact.
  // Map `fill:` and `color:` separately — #ffffff means a white node in `fill:`
  // but white text in `color:`, so a single per-hex map would corrupt one of them.
  return source.replace(/classDef[^\n]*/gi, line =>
    line
      .replace(/(fill:\s*)(#[0-9a-fA-F]{3,6})/gi, (_m, p, hex) => p + (MERMAID_FILL_MAP[hex.toLowerCase()] ?? hex))
      .replace(/(color:\s*)(#[0-9a-fA-F]{3,6})/gi, (_m, p, hex) => p + (MERMAID_INK_MAP[hex.toLowerCase()] ?? hex)),
  )
}

// eslint-disable-next-line no-control-regex -- \x00 sentinel penanda blok mermaid (disengaja)
const MERMAID_RE = /\x00MERMAID:(\d+)\x00/

function MermaidDiagram({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // Re-render when the app theme flips so node fills/labels follow dark/light.
  const [themeTick, setThemeTick] = useState(0)
  useEffect(() => {
    const onChange = () => setThemeTick(t => t + 1)
    window.addEventListener('atlas:themechange', onChange)
    return () => window.removeEventListener('atlas:themechange', onChange)
  }, [])

  useEffect(() => {
    if (!ref.current || !source) return
    const el = ref.current
    let cancelled = false

    const render = async () => {
      // Wait until the page web fonts (Inter) are ready before rendering, so
      // mermaid measures glyph widths against the actual font — not a fallback
      // metric that would size rects narrower than the eventual rendered text.
      // Hard cap at 2s so a font-loading hiccup never blocks the diagram.
      try {
        await Promise.race([
          document.fonts?.ready ?? Promise.resolve(),
          new Promise(resolve => setTimeout(resolve, 2000)),
        ])
      } catch { /* noop */ }
      if (cancelled) return

      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      initMermaid(isDark ? 'dark' : 'light')
      const src = isDark ? adaptMermaidForDark(source) : source
      const uid = 'mrd' + Math.random().toString(36).slice(2, 11)
      try {
        const { svg } = await mermaid.render(uid, src)
        if (cancelled || !el) return
        el.innerHTML = svg
        const svgEl = el.querySelector<SVGSVGElement>('svg')
        if (svgEl) {
          const w = parseFloat(svgEl.getAttribute('width') || '0')
          const h = parseFloat(svgEl.getAttribute('height') || '0')
          if (w && h && !svgEl.getAttribute('viewBox')) {
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
          }
          svgEl.removeAttribute('width')
          svgEl.removeAttribute('height')
          svgEl.style.width = '100%'
          svgEl.style.height = 'auto'
        }
      } catch (err) {
        if (el && !cancelled) el.innerHTML = `<p class="pb-mermaid__err">${String(err)}</p>`
      }
    }

    void render()
    return () => { cancelled = true }
  }, [source, themeTick])

  return <div className="pb-mermaid" ref={ref}><span className="pb-mermaid__spin" /></div>
}

function PlaybookContent({ html, sources }: { html: string; sources: string[] }) {
  const segments = html.split(MERMAID_RE)
  // split with capture group: [html, idx, html, idx, ...]
  return (
    <>
      {segments.map((seg, i) => {
        if (i % 2 === 0) {
          return seg ? <div key={i} dangerouslySetInnerHTML={{ __html: seg }} /> : null
        }
        const idx = parseInt(seg, 10)
        return <MermaidDiagram key={i} source={sources[idx] ?? ''} />
      })}
    </>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlaybookView() {
  const { t } = useTranslation()
  const [data, setData] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')
  const [showTop, setShowTop] = useState(false)
  const [query, setQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const filteredGroups = useMemo<TocGroup[]>(() => {
    const groups = groupToc(data?.toc ?? [])
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map(g => ({ ...g, items: g.items.filter(it => it.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0)
  }, [data, query])

  useEffect(() => {
    fetch('/docs/ATLAS_PLAYBOOK.md')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
      .then(md => setData(parse(md)))
      .catch(e => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!data || !contentRef.current) return
    const headings = Array.from(contentRef.current.querySelectorAll<HTMLElement>('h2[id]'))
    if (!headings.length) return
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-60px 0px -70% 0px', threshold: 0 }
    )
    headings.forEach(h => obs.observe(h))
    return () => obs.disconnect()
  }, [data])

  // Keep active TOC item in view as user scrolls through long docs.
  // `block: 'nearest'` is a no-op when the item is already visible — so this
  // only fires when the active section moves outside the nav viewport.
  useEffect(() => {
    if (!activeId) return
    const navEl = document.querySelector('.pb-nav')
    const activeBtn = navEl?.querySelector<HTMLElement>('.pb-nav__item--active')
    activeBtn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Anchor permalink: click on heading's "#" button copies the deep link to
  // clipboard. Uses event delegation so we attach once and survive re-renders
  // of the markdown body.
  useEffect(() => {
    if (!data || !contentRef.current) return
    const el = contentRef.current
    const onClick = (ev: Event) => {
      const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.pb-anchor')
      if (!target) return
      ev.preventDefault()
      const id = target.dataset.anchor
      if (!id) return
      const url = `${window.location.origin}${window.location.pathname}#${id}`
      // Clipboard API may reject on insecure context or denied permission —
      // fall back silently rather than break the click.
      void navigator.clipboard?.writeText(url).catch(() => { /* noop */ })
      // Update URL hash without scrolling (scroll already happens on heading
      // observe; here the user has clicked the anchor next to the heading
      // they're already viewing).
      history.replaceState(null, '', `#${id}`)
      target.classList.add('pb-anchor--copied')
      window.setTimeout(() => target.classList.remove('pb-anchor--copied'), 1400)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [data])

  // Show "Ke atas" only after scrolling past intro area (~200px)
  useEffect(() => {
    const el = document.querySelector('.workspace__content')
    if (!el) return
    const onScroll = () => setShowTop(el.scrollTop > 200)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    document.querySelector('.workspace__content')?.scrollTo({ top: 0, behavior: 'smooth' })
    setShowTop(false)
    setActiveId('')
  }, [])

  if (error) return (
    <div className="ds playbook-v2 pb-workspace ds-stagger">
      <div className="pb-state">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 4.5v3.5M7.5 10v.5"/></svg>
        {t('Failed to load playbook:')} {error}
      </div>
    </div>
  )

  if (!data) return (
    <div className="ds playbook-v2 pb-workspace ds-stagger">
      <div className="pb-state">
        <span className="pb-state__spin" />
        {t('Loading playbook…')}
      </div>
    </div>
  )

  return (
    <div className="ds playbook-v2 pb-workspace ds-stagger">
      {/* ── Two-column layout ── */}
      <div className="pb-layout">
        {/* TOC */}
        <nav className="pb-nav" aria-label={t('Playbook table of contents')}>
          <div className="pb-search">
            <svg className="pb-search__icon" width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <circle cx="6" cy="6" r="4.25" />
              <path d="m9.25 9.25 3 3" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              className="pb-search__input"
              placeholder={t('Search sections…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              aria-label={t('Search the playbook')}
            />
            {query && (
              <button
                type="button"
                className="pb-search__clear"
                onClick={() => { setQuery(''); searchRef.current?.focus() }}
                aria-label={t('Clear search')}
                title={t('Clear')}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="m2 2 6 6M8 2l-6 6" />
                </svg>
              </button>
            )}
          </div>

          {filteredGroups.length === 0 ? (
            <p className="pb-nav__empty">{t('No sections match "{{query}}".', { query })}</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="pb-nav__group">
                <p className="pb-nav__group-label">{group.label}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`pb-nav__item${activeId === item.id ? ' pb-nav__item--active' : ''}`}
                    onClick={() => scrollTo(item.id)}
                    title={item.label}
                  >
                    {item.num !== null && <span className="pb-nav__idx">{item.num}</span>}
                    {item.label}
                  </button>
                ))}
              </div>
            ))
          )}

          <button
            type="button"
            className={`pb-nav__top${showTop ? ' pb-nav__top--visible' : ''}`}
            onClick={scrollToTop}
            title={t('Back to top')}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 9V2M2 5l3.5-3L9 5" />
            </svg>
            {t('To top')}
          </button>
        </nav>

        {/* Content */}
        <div className="pb-content" ref={contentRef}>
          <header className="pb-page-header">
            <h1 className="pb-page-header__title">{data.h1 || t('ATLAS Playbook')}</h1>
            <p className="pb-page-header__meta">
              <span>{t('{{count}} sections', { count: data.toc.filter(e => e.num !== null).length })}</span>
              {data.updatedAt && (
                <>
                  <span className="pb-page-header__dot" aria-hidden="true" />
                  <span>{t('Updated {{date}}', { date: data.updatedAt })}</span>
                </>
              )}
            </p>
          </header>
          <div className="pb-body">
            <PlaybookContent html={data.html} sources={data.mermaidSources} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlaybookView
