import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Head, usePage } from '@inertiajs/react'
import { useInertiaNavigate } from '../../hooks/useInertiaNavigate'
import { Card, Pill } from '../../design-system'
import { scoreTone, realisasiPercent, formatNumber, formatPeriod, bulletPct } from './_shared'
import { InsightPanel, type InsightPayload } from './InsightPanel'
import { KpiScoreTable, type ScoreGroup } from './KpiScoreTable'
import './Performance.css'

type KpiItem = {
  kode: string
  nama: string
  satuan: string
  polaritas: 'maximize' | 'minimize'
  bobot: number
  target: number
  realisasi: number
  skor: number
}

type KpiGroup = {
  perspektif: string
  perspektif_key: string
  color: 'green' | 'yellow' | 'red'
  pct: number
  items: KpiItem[]
}

type Direktur = {
  kode: string
  nama: string
  jabatan: string
  slug: string
  /** Skor total kanonik (DirektoratScorecard.nilai) — single source of truth, sama dgn halaman list. Null bila belum ada data periode ini. */
  nilai: number | null
}

type PageProps = {
  direktur: Direktur
  kpiGroups: KpiGroup[]
  insight: InsightPayload
  periode: string
}

// dark-allow: palet identitas perspektif BSC (kategorikal), konsisten dua theme
const PERSPEKTIF_COLORS: Record<string, string> = {
  ekonomi_sosial: 'var(--ds-green-500)',
  imb:            '#6366F1',
  teknologi:      '#06B6D4',
  investasi:      'var(--ds-amber-500)',
  talenta:        '#A855F7',
  // Balanced Scorecard perspektif (KPI direktorat/divisi, mis. DIR-KMR)
  financial:      'var(--ds-green-500)',
  customer:       '#6366F1',
  ibp:            '#06B6D4',
  lng:            'var(--ds-amber-500)',
}

export default function KolegialDetailView() {
  const { t } = useTranslation()
  const { direktur, kpiGroups, insight, periode } = usePage<PageProps>().props
  const navigate = useInertiaNavigate()
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [lowestFirst, setLowestFirst] = useState(false)

  // Skor total = nilai kanonik dari BE (DirektoratScorecard.nilai) supaya IDENTIK
  // dengan halaman list. Fallback ke penjumlahan item HANYA bila data kanonik kosong.
  const computedSkor = kpiGroups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.skor, 0), 0)
  const totalSkor = direktur.nilai ?? computedSkor
  const totalTone = scoreTone(totalSkor)
  const totalKpi = kpiGroups.reduce((n, g) => n + g.items.length, 0)
  const periodeLabel = formatPeriod(periode)

  const itemPct = (i: KpiItem) => realisasiPercent(i.target, i.realisasi, i.polaritas)
  const attentionCount = kpiGroups.reduce(
    (n, g) => n + g.items.filter(i => itemPct(i) < 100).length, 0)

  // Triage pipeline: filter perspektif → filter status → sort, lalu di-map ke
  // bentuk tabel scorecard (KpiScoreTable). Grup kosong di-drop.
  const tableGroups: ScoreGroup[] = (activeFilter === 'all'
    ? kpiGroups
    : kpiGroups.filter(g => g.perspektif_key === activeFilter))
    .map(g => {
      let items = attentionOnly ? g.items.filter(i => itemPct(i) < 100) : g.items
      if (lowestFirst) items = [...items].sort((a, b) => itemPct(a) - itemPct(b))
      return {
        key: g.perspektif_key,
        label: g.perspektif,
        color: PERSPEKTIF_COLORS[g.perspektif_key] ?? 'var(--ds-text-tertiary)',
        bobot: items.reduce((s, i) => s + i.bobot, 0),
        pct: g.pct,
        items: items.map((i, idx) => ({
          no: idx + 1,
          kode: i.kode,
          nama: i.nama,
          satuan: i.satuan,
          polaritas: i.polaritas,
          bobot: i.bobot,
          target: i.target,
          realisasi: i.realisasi,
          skor: i.skor,
        })),
      }
    })
    .filter(g => g.items.length > 0)

  return (
    <>
      <Head title={t('KPI Collegial — {{jabatan}}', { jabatan: direktur.jabatan })} />
      <div className="ds perf view-performance">
        <div className="perf__inner ds-stagger">
          {/* ─── Header ──────────────────────────── */}
          <header className="perf__header">
            <div className="perf__header-left">
              <button className="perf__back" onClick={() => navigate('/performance/kolegial')} type="button">
                <IconBack />
                {t('Back')}
              </button>
              <h1 className="perf__title">{t('KPI Collegial — {{jabatan}}', { jabatan: direktur.jabatan })}</h1>
            </div>
            <div className="perf__header-actions">
              <span className="perf__period-pill">
                <IconCalendar />
                {periodeLabel}
              </span>
            </div>
          </header>

          {/* ─── Subject hero: verdict (angka besar solid) | bullet perspektif ──
              Satu bahasa visual dengan Scorecard (Target Bullet). */}
          <Card padding="none" className="perf__section perf-hero perf-hero--bullet" data-tone={totalTone}>
            <div className="perf-hero__top">
              <div className="perf-hero__verdict">
                <span className="perf-hero__eyebrow">{direktur.jabatan}</span>
                <h2 className="perf-hero__name">{direktur.nama}</h2>
                <div className="perf-hero__numrow">
                  <span className="perf-hero__num" data-tone={totalTone}>
                    {formatNumber(totalSkor)}<span className="perf-hero__num-unit">%</span>
                  </span>
                </div>
                <div className="perf-hero__tags">
                  <Pill variant="mono">{direktur.kode}</Pill>
                  <Pill tone="neutral" variant="soft">{periodeLabel}</Pill>
                  <Pill tone="neutral" variant="soft">{t('{{count}} KPI items', { count: totalKpi })}</Pill>
                  {attentionCount > 0 && (
                    <Pill tone="amber" variant="soft">{t('{{count}} below target', { count: attentionCount })}</Pill>
                  )}
                </div>
                <span className="perf-hero__sub">{t('Total score · vs target 100% · {{period}}', { period: periodeLabel })}</span>
              </div>
              <div className="perf-bullet-wrap perf-bullet-wrap--persp">
                <div className="perf-bullet-scale">
                  <span>90</span>
                  <span className="perf-bullet-scale__t">{t('Target 100')}</span>
                  <span>110</span>
                </div>
                <div className="perf-bullet-rows">
                  {kpiGroups.map(g => (
                    <div key={g.perspektif_key} className="perf-bullet-row perf-bullet-row--static">
                      <span className="perf-bullet-row__code" title={g.perspektif}>
                        {g.perspektif === 'Internal Business Process' ? 'IBP' : g.perspektif}
                      </span>
                      <span className="perf-bullet perf-bullet--mini" aria-hidden>
                        <span className="perf-bullet__target" />
                        <span className="perf-bullet__measure" data-tone={scoreTone(g.pct)} style={{ width: `${bulletPct(g.pct)}%` }} />
                      </span>
                      <span className="perf-bullet-row__val" data-tone={scoreTone(g.pct)}>{formatNumber(g.pct)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* ─── Insight Utama (auto-derived) ───── */}
          <section className="perf__section">
            <InsightPanel insight={insight} />
          </section>

          {kpiGroups.length === 0 ? (
            <Card padding="lg" className="perf__section perf-empty">
              <div className="perf-empty__title">{t('No KPI breakdown yet')}</div>
              <div>{t('The KPI breakdown for {{jabatan}} is not registered for the {{periode}} period.', { jabatan: direktur.jabatan, periode: periodeLabel })}</div>
            </Card>
          ) : (
          <>
          {/* ─── Perspektif filter + triage ───────── */}
          <div className="perf-filter-row">
            <button
              type="button"
              className="perf-filter"
              data-active={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
            >
              {t('All perspectives')}
            </button>
            {kpiGroups.map(g => (
              <button
                key={g.perspektif_key}
                type="button"
                className="perf-filter"
                data-active={activeFilter === g.perspektif_key}
                onClick={() => setActiveFilter(g.perspektif_key)}
              >
                <span className="perf-filter__dot" style={{ background: PERSPEKTIF_COLORS[g.perspektif_key] ?? 'var(--ds-text-tertiary)' }} />
                {g.perspektif}
              </button>
            ))}
            <span className="perf-filter-row__spacer" aria-hidden />
            <button
              type="button"
              className="perf-filter perf-filter--triage"
              data-active={attentionOnly}
              onClick={() => setAttentionOnly(v => !v)}
              title={t('Show only KPIs below 100% achievement')}
            >
              <span className="perf-filter__dot" style={{ background: 'var(--tone-amber)' }} />
              {attentionCount > 0 ? t('Needs attention ({{count}})', { count: attentionCount }) : t('Needs attention')}
            </button>
            <button
              type="button"
              className="perf-filter perf-filter--triage"
              data-active={lowestFirst}
              onClick={() => setLowestFirst(v => !v)}
              title={t('Sort lowest achievement first')}
            >
              {t('↓ Lowest first')}
            </button>
          </div>

          {/* Penjelasan skala — deviation bar berjangkar 100%, zoom ±. */}
          <p className="perf-scale-note">
            {t('Score = weight × achievement (capped 110%). The achievement bar is anchored at the 100% line — right of the line = above target, left = below (zoomed ±).')}
          </p>

          {/* ─── KPI scorecard table ───────────────── */}
          {tableGroups.length === 0 ? (
            <Card padding="md" className="perf-empty">
              <div className="perf-empty__title">{t('Nothing needs attention')}</div>
              <div>{t('All KPIs in this view meet 100% of target. Clear the filter to see everything.')}</div>
            </Card>
          ) : (
            <Card padding="none" className="perf__section perf-table-card">
              <KpiScoreTable groups={tableGroups} />
            </Card>
          )}
          </>
          )}
        </div>
      </div>
    </>
  )
}

function IconBack() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 2-4 4 4 4" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="1.5" />
      <path d="M1 6h12M5 2v2M9 2v2" />
    </svg>
  )
}
