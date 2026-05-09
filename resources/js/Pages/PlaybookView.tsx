import { useState, useEffect, useRef, useCallback } from 'react'
import mermaid from 'mermaid'
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
    .replace(/\x00([^\x01]*)\x01/g, '&$1;')
}

function inl(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code class="pb-ic">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="pb-a" href="$2" target="_blank" rel="noopener">$1</a>')
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
type ParseResult = { html: string; toc: TocEntry[]; h1: string; mermaidSources: string[] }

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
      out.push(`<div class="pb-who"><span class="pb-who__label">Untuk siapa:</span><span class="pb-who__roles">${inl(content)}</span></div>`)
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
      out.push(`<h${lv} class="pb-h${lv}" id="${id}">${inl(hm[2])}</h${lv}>`)
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

  return { html: out.join('\n'), toc, h1, mermaidSources }
}

// ── Mermaid ───────────────────────────────────────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#ffffff',
    primaryBorderColor: '#2d6a4f',
    primaryTextColor: '#1a1a1a',
    lineColor: '#6b7280',
    edgeLabelBackground: '#f8faf8',
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    fontSize: '12px',
    nodeBorder: '#2d6a4f',
    clusterBkg: '#f0f7f0',
    titleColor: '#1a1a1a',
    edgeColor: '#6b7280',
  },
  flowchart: { curve: 'basis', padding: 10, useMaxWidth: true, htmlLabels: true, nodeSpacing: 30, rankSpacing: 40 },
})

const MERMAID_RE = /\x00MERMAID:(\d+)\x00/

function MermaidDiagram({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !source) return
    const el = ref.current
    const uid = 'mrd' + Math.random().toString(36).slice(2, 11)
    mermaid.render(uid, source)
      .then(({ svg }) => {
        if (!el) return
        el.innerHTML = svg
        // Make SVG scale to container width while keeping natural aspect ratio
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
      })
      .catch(err => { if (el) el.innerHTML = `<p class="pb-mermaid__err">${String(err)}</p>` })
  }, [source])

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

const UPDATED = '22 Apr 2026'

export function PlaybookView() {
  const [data, setData] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState('')
  const [showTop, setShowTop] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

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

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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
    <div className="ds playbook-v2 pb-workspace">
      <div className="pb-state">
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><path d="M7.5 4.5v3.5M7.5 10v.5"/></svg>
        Gagal memuat playbook: {error}
      </div>
    </div>
  )

  if (!data) return (
    <div className="ds playbook-v2 pb-workspace">
      <div className="pb-state">
        <span className="pb-state__spin" />
        Memuat playbook…
      </div>
    </div>
  )

  return (
    <div className="ds playbook-v2 pb-workspace">
      {/* ── Sticky page header bar (matches benchmark pages) ── */}
      <header className="pb-topbar">
        <div className="pb-topbar__left">
          <h1 className="pb-topbar__title">{data.h1 || 'ATLAS Playbook'}</h1>
          <p className="pb-topbar__sub">
            <span>{data.toc.filter(t => t.num !== null).length} workflow</span>
            <span className="pb-topbar__dot" aria-hidden="true" />
            <span>Diperbarui {UPDATED}</span>
          </p>
        </div>
      </header>

      {/* ── Two-column layout ── */}
      <div className="pb-layout">
        {/* TOC */}
        <nav className="pb-nav" aria-label="Navigasi workflow">
          <p className="pb-nav__heading">Workflow</p>
          {data.toc.map((item, idx) => {
            const prevIsRef = idx > 0 && data.toc[idx - 1].num === null
            const showDivider = item.num !== null && prevIsRef
            return (
              <div key={item.id}>
                {showDivider && <div className="pb-nav__divider" />}
                <button
                  type="button"
                  className={`pb-nav__item${activeId === item.id ? ' pb-nav__item--active' : ''}`}
                  onClick={() => scrollTo(item.id)}
                  title={item.label}
                >
                  {item.num !== null && <span className="pb-nav__idx">{item.num}</span>}
                  {item.label}
                </button>
              </div>
            )
          })}

          <button
            type="button"
            className={`pb-nav__top${showTop ? ' pb-nav__top--visible' : ''}`}
            onClick={scrollToTop}
            title="Kembali ke atas"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5.5 9V2M2 5l3.5-3L9 5" />
            </svg>
            Ke atas
          </button>
        </nav>

        {/* Content */}
        <div className="pb-content" ref={contentRef}>
          <div className="pb-body">
            <PlaybookContent html={data.html} sources={data.mermaidSources} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default PlaybookView
