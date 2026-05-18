import { useMemo } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

/** Direktorat color palette — stable per-kode mapping. */
const DIRECTORATE_COLORS: Record<string, string> = {
  DIRUT:  '#0ea5e9',
  DBS:    '#a855f7',
  DAS:    '#f97316',
  DPP:    '#22c55e',
  DSU:    '#06b6d4',
  DKM:    '#16a34a',
  'DIR-KMR': '#16a34a',
}

const DEFAULT_PALETTE = ['#0ea5e9', '#a855f7', '#f97316', '#22c55e', '#06b6d4', '#16a34a', '#ec4899', '#eab308']

function colorFor(kode: string, idx: number): string {
  return DIRECTORATE_COLORS[kode] ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length]
}

export type KpiTrendPayload = {
  periodes: { key: string; label: string }[]
  series: { kode: string; nama: string; values: (number | null)[] }[]
}

type Props = {
  trend: KpiTrendPayload
  height?: number
}

/**
 * Bar chart clustered — x-axis bulan, y-axis skor KPI, satu warna per direktorat.
 * Mirror "Tren Skor KPI" slide 8 PDF DKMR.
 *
 * Recharts butuh data shape `[{label: 'Jan', DKM: 102, DSU: 101, ...}, ...]`,
 * jadi kita pivot dari format service (per-series values) ke per-periode.
 */
export function KpiTrendChart({ trend, height = 260 }: Props) {
  const data = useMemo(() => {
    if (!trend.periodes.length || !trend.series.length) return []
    return trend.periodes.map((p, i) => {
      const row: Record<string, string | number | null> = { label: p.label, key: p.key }
      trend.series.forEach(s => {
        row[s.kode] = s.values[i]
      })
      return row
    })
  }, [trend])

  if (data.length === 0) {
    return (
      <div className="kpi-trend-empty">
        Belum ada data scorecard untuk periode ini.
      </div>
    )
  }

  return (
    <div className="kpi-trend-chart">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border, #e5e7eb)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted, #6b7280)' }} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 110]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: 'var(--text-muted, #6b7280)' }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated, #fff)',
              border: '1px solid var(--panel-border, #e5e7eb)',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value) => {
              const n = typeof value === 'number' ? value : Number(value)
              return [Number.isFinite(n) ? `${n.toFixed(1)}%` : '—', '']
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            iconType="circle"
            iconSize={8}
          />
          {trend.series.map((s, idx) => (
            <Bar
              key={s.kode}
              dataKey={s.kode}
              name={s.nama}
              fill={colorFor(s.kode, idx)}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colorFor(s.kode, idx)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
