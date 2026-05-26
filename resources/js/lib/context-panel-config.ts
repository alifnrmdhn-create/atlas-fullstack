/* Context panel resolver — route → panel definition.
 *
 * Pages opt out by being absent from this map (or matched by an opt-out
 * predicate). Pages opt in by registering a definition here, keeping the
 * shell free of per-page imports.
 *
 * The component receives no props; it pulls data from Inertia shared
 * props or its own queries. This keeps page components decoupled from
 * the shell — pages never need to know the panel exists.
 */

import type { ComponentType } from 'react'
import { ScorecardInsightPanel } from '../components/context-panels/ScorecardInsightPanel'
import { ReportsAnalyticsPanel } from '../components/context-panels/ReportsAnalyticsPanel'
import { MonthlyReportsFilterPanel } from '../components/context-panels/MonthlyReportsFilterPanel'
import { RiskReportsFilterPanel } from '../components/context-panels/RiskReportsFilterPanel'

export type ContextPanelDef = {
  /** Title shown in the panel header. */
  title: string
  /** Component rendered as panel body. */
  Component: ComponentType
}

/** Active path → panel. Opt out by omission or by matching OPT_OUT_PATHS.
 *
 * Home (`/`) intentionally has no panel — its hero already surfaces the
 * priorities a panel would show, so a side panel here would just duplicate.
 *
 * Programs (`/programs`) intentionally has no panel — filters are inline as
 * chips in the page sub-toolbar, which is more space-efficient for a small
 * filter set (3 status + 1 stale) than a 250px side panel. */
export const CONTEXT_PANELS: Record<string, ContextPanelDef> = {
  '/performance/scorecard': { title: 'Insight Scorecard', Component: ScorecardInsightPanel },
  '/reports': { title: 'Insight Analytics', Component: ReportsAnalyticsPanel },
  '/laporan-bulanan': { title: 'Filter Report', Component: MonthlyReportsFilterPanel },
  '/laporan-risiko': { title: 'Filter Risk Report', Component: RiskReportsFilterPanel },
}

/** Routes that suppress the panel even when the prefix would match (e.g.,
 *  Channels has its own internal 3-pane, Workboard needs full kanban width). */
const OPT_OUT_PATHS: ReadonlyArray<string> = [
  '/channels',
  '/execution',
  '/jadwal',
]

const OPT_OUT_PREFIXES: ReadonlyArray<string> = [
  '/channels/',
  '/admin/',
]

export function resolveContextPanel(activePath: string, pathname: string): ContextPanelDef | null {
  if (OPT_OUT_PATHS.includes(activePath)) return null
  if (OPT_OUT_PREFIXES.some((p) => pathname.startsWith(p))) return null
  return CONTEXT_PANELS[activePath] ?? null
}
