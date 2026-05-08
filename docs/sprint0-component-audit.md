# Sprint 0 Track B — Component Library Audit

> **Tujuan**: Inventarisasi UI primitives yang dibutuhkan rencana PDCA vs yang sudah ada. Hindari rebuild komponen yang sudah dibangun.
> **Tanggal**: 2026-05-07

## Lokasi Komponen

- `resources/js/components/` — komponen domain spesifik (ExecutionGrid, MonitoringMatrix, dst)
- `resources/js/components/ui.tsx` — **single-file primitive library** (50.7 KB)
- `resources/js/hooks/` — hooks utility (useEscKey, useDialogFocus, dst)
- Tidak ada `components/ui/` directory — semua primitive di `ui.tsx`

## Inventaris Primitive Existing (`ui.tsx`)

| Primitive | Lokasi | Signature | Catatan |
|---|---|---|---|
| `EmptyState` | ui.tsx:572 | `{title, text, icon, compact}` | Pakai SvgIcon. Cocok untuk empty section |
| `SectionState` | ui.tsx:594 | `{title, text, compact, icon}` | Mirip EmptyState tapi inline |
| `InlineNotice` | ui.tsx:614 | `{children, tone: 'default' \| 'error'}` | Untuk pesan alert ringan |
| `SkeletonBlock` | ui.tsx:624 | `{width, height, className}` | Loading state |
| `SkeletonStack` | ui.tsx:636 | `{lines: number[]}` | Loading state composite |
| `HealthPill` | ui.tsx:393 | `{status: 'GREEN' \| 'YELLOW' \| 'RED' \| 'OVERDUE'}` | **Sudah ada** untuk health status — re-use untuk dual health di Sprint 5 |
| `Avatar` | ui.tsx | `{name, size}` | User avatar |
| `StatCard`, `Metric` | ui.tsx | — | Untuk dashboard cards |
| `MiniDonut`, `GaugeArc`, `RiskBar` | ui.tsx | — | Visual progress indicators |
| `formatRelativeTime` | ui.tsx | `(isoString) => {text, age}` | **Re-use untuk aging escalation** |
| `PanelHeader` | ui.tsx | `{title, subtitle, onClose}` | Untuk panel/drawer header |
| `RichTextPreview` | ui.tsx | — | Render rich text content |
| `PresenceRow` | ui.tsx | — | User presence indicator |
| `ComposerTools`, `ComposerModeToggle` | ui.tsx | — | Komentar/edit composer |

## Pattern yang Sudah Established di Codebase

### Modal Pattern (luas digunakan)
- Class: `modal-backdrop`, `modal`, `modal__header`, `modal__body`, `modal__footer`
- Dialog accessibility: `aria-modal`, `aria-labelledby`, `aria-describedby`, `role="dialog"`
- Hooks pendukung: `useDialogFocus<T>(active)`, `useEscKey(onEsc, active)`
- Variants: `schedule-modal--lg`, `schedule-modal--md`, `schedule-modal--confirm`
- Contoh: `MeetingDetailPanel.tsx:1268+` (5 modal berbeda)

### Collapsible Pattern (TaskDetailView)
- Helper: `loadCollapsedPanels()`, `saveCollapsedPanels(state)` di `TaskDetailView.tsx:113`
- State: `Record<string, boolean>` keyed per section
- Persisted di localStorage
- **Sebagai pattern, bukan komponen reusable** — perlu di-extract jadi `<CollapsibleSection>` untuk Sprint 2

### Toast Pattern (per-page)
- Di-implement per-page (TaskDetailView punya, MeetingDetailPanel punya, dst)
- State `{msg, tone: 'success' \| 'error'}`, auto-dismiss timer
- **Tidak ada toast library global** — bisa di-extract di sprint mendatang, tapi tidak blocker

## Yang DIBUTUHKAN Rencana PDCA — Status

| Komponen | Status | Action |
|---|---|---|
| **CollapsibleSection** | 🟡 Pattern ada, komponen belum | **Extract di Sprint 2** sebagai `<CollapsibleSection title count defaultOpen>`. Re-use `loadCollapsedPanels` / `saveCollapsedPanels`. Estimasi: 1–2 jam |
| **EmptyState** | ✅ Ada | Re-use `EmptyState` dari ui.tsx |
| **Loading skeleton** | ✅ Ada | Re-use `SkeletonBlock` / `SkeletonStack` |
| **Error state** | ✅ Ada | Re-use `InlineNotice` dengan `tone='error'` + retry button manual |
| **HealthBadge** (dual health Sprint 5) | ✅ Ada `HealthPill` | Tambah variant `outlined` + `filled` lewat prop, atau styling additive di CSS |
| **DiscrepancyBadge** | ❌ Belum ada | **Buat baru di Sprint 5** — 30 menit. Simple wrapper + styling |
| **DataSourceBadge** (dummy data label di Sprint 2) | ❌ Belum ada | **Buat baru di Sprint 2** — 30 menit. `<DataSourceBadge type='dummy' tooltip>` |
| **ForecastBadge** (linear forecast Sprint 5) | ❌ Belum ada | **Buat baru di Sprint 5** — 1 jam. Re-use HealthPill color logic |
| **AgingIndicator** (escalation Sprint 4) | 🟡 Helper ada | Pakai `formatRelativeTime` + custom CSS class color decay. Buat thin wrapper `<AgingIndicator since={iso}>` di Sprint 4 — 1–2 jam |
| **SidePanel pattern** (escalation triage Sprint 4) | ❌ Belum ada | **Buat baru di Sprint 4** — pattern modal slide-in dari kanan, mobile fallback ke full-screen modal. 4–6 jam termasuk CSS |
| **Toast** | 🟡 Per-page exists | Untuk MVP: copy pattern existing per-page. Tidak block. |

## Hooks Existing yang Re-usable

| Hook | Lokasi | Use case |
|---|---|---|
| `useEscKey(onEsc, active)` | hooks/useEscKey.ts | Tutup overlay dengan Escape — re-use untuk SidePanel |
| `useDialogFocus<T>(active)` | hooks/useDialogFocus.ts | Focus trap di modal/panel — re-use untuk SidePanel |
| `useInertiaNavigate` | hooks/useInertiaNavigate.ts | Navigation programmatic |
| `useWorkspace` | hooks/useWorkspace.ts | Global workspace state |

## Hooks BARU yang Perlu Dibuat

| Hook | Sprint | Estimasi |
|---|---|---|
| `useLocalStoragePreference<T>(key, defaultValue)` | Sprint 3 | 30 menit. Generic helper untuk PICA collapsed pref + lain |
| `useOptimisticMutation` | Sprint 2 (di-buat saat dibutuhkan, re-use Sprint 3+4) | 1–2 jam |
| `usePicaRealtime(meetingId)` | Sprint 3 | Tergantung RealtimeController fit. 2–4 jam |
| `useOnboardingTour(tourId)` | Sprint 4 | Wrapper Shepherd.js. 1–2 jam |
| `useFeatureFlag(flagName)` | Sprint 4 | 1 jam. Read dari `usePage().props.features` |

## Kesimpulan

**Berita baik**: Codebase punya foundation primitive yang solid. EmptyState, Skeleton, HealthPill, modal pattern, focus management — semua sudah established. Plan PDCA tidak perlu rebuild ini.

**Yang harus dibangun baru** (terdistribusi per sprint):
- `<CollapsibleSection>` — Sprint 2 (extract dari pattern existing)
- `<DataSourceBadge>` — Sprint 2
- `<AgingIndicator>` — Sprint 4
- `<SidePanel>` pattern — Sprint 4 (paling besar, 4–6 jam)
- `<DiscrepancyBadge>` + `<ForecastBadge>` — Sprint 5

**Total tambahan komponen primitive baru**: ~6 komponen, estimasi total ~10–14 jam terdistribusi di 4 sprint. Tidak blocking.

**Rekomendasi**: tetap ikuti rencana sprint. Tidak perlu sprint khusus untuk "build component library" — tiap primitive baru ditambahkan saat dibutuhkan di sprint terkait.
