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
import { HomeFocusPanel } from '../components/context-panels/HomeFocusPanel'
import { ProgramsFilterPanel } from '../components/context-panels/ProgramsFilterPanel'
import { ScorecardInsightPanel } from '../components/context-panels/ScorecardInsightPanel'
import { ReportsAnalyticsPanel } from '../components/context-panels/ReportsAnalyticsPanel'
import { MonthlyReportsFilterPanel } from '../components/context-panels/MonthlyReportsFilterPanel'

export type ContextPanelDef = {
  /** Title shown in the panel header. */
  title: string
  /** Component rendered as panel body. */
  Component: ComponentType
}

/** Active path → panel. Opt out by omission or by matching OPT_OUT_PATHS. */
export const CONTEXT_PANELS: Record<string, ContextPanelDef> = {
  '/': { title: 'Fokus hari ini', Component: HomeFocusPanel },
  '/programs': { title: 'Filter Programs', Component: ProgramsFilterPanel },
  '/performance/scorecard': { title: 'Insight Scorecard', Component: ScorecardInsightPanel },
  '/reports': { title: 'Insight Analytics', Component: ReportsAnalyticsPanel },
  '/laporan-bulanan': { title: 'Filter Laporan', Component: MonthlyReportsFilterPanel },
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
