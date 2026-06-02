import { useMemo, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Head, Link } from '@inertiajs/react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import PanduanKonsepHierarki from './PanduanKonsepHierarki'
import './PanduanView.css'

// ── Quick card icons — match destination semantics ──────────────────────────
function QuickCardIcon({ href }: { href: string }): ReactElement {
  const s = { width: 18, height: 18, viewBox: '0 0 18 18', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const }
  if (href === '/executive')              return <svg {...s}><path d="M3 14V8M7 14V5M11 14v-7M15 14V3"/></svg>
  if (href === '/performance/scorecard')  return <svg {...s}><path d="M9 2 10.6 5.5l3.8.4-2.8 2.5L12.5 12 9 9.9 5.5 12l.9-3.6L3.6 5.9l3.8-.4z"/></svg>
  if (href === '/performance/kolegial')   return <svg {...s}><circle cx="9" cy="9" r="6"/><path d="M9 9V5M9 9l3 2"/></svg>
  if (href === '/performance/divisi')     return <svg {...s}><rect x="2" y="11" width="3" height="5"/><rect x="7.5" y="7" width="3" height="9"/><rect x="13" y="3" width="3" height="13"/></svg>
  if (href === '/performance/me')         return <svg {...s}><circle cx="9" cy="6.5" r="2.8"/><path d="M3.5 15.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/></svg>
  if (href === '/programs')               return <svg {...s}><rect x="3.5" y="3" width="11" height="12" rx="1.5"/><path d="M7 3h4v2H7z"/><path d="M6 8h6M6 11h4"/></svg>
  if (href === '/roadmap')                return <svg {...s}><path d="M2 5h14M2 9h10M2 13h7"/></svg>
  if (href === '/execution')              return <svg {...s}><rect x="2.5" y="3" width="3.5" height="12" rx="1"/><rect x="7.5" y="3" width="3.5" height="9" rx="1"/><rect x="12.5" y="3" width="3.5" height="6" rx="1"/></svg>
  if (href === '/penugasan')              return <svg {...s}><rect x="3" y="2.5" width="11" height="12" rx="1.5"/><path d="M6 2.5h5v2H6z"/><path d="M6 9h5M6 12h3"/></svg>
  return <svg {...s}><circle cx="9" cy="9" r="6"/></svg>
}

// ── Custom line-icon set ──────────────────────────────────────────────────
// Mengganti emoji dengan ikon garis kustom (monokrom, currentColor) — emoji =
// sinyal "AI slop" di tool enterprise. 20×20, stroke 1.6, tint dari tile.
const ICON_BOX = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const }

function TopikIcon({ slug }: { slug: string }): ReactElement {
  switch (slug) {
    case 'buat-program':              // dokumen + plus
      return <svg {...ICON_BOX}><path d="M11 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8A1.5 1.5 0 0 0 15.5 16V7z"/><path d="M11 2.5V7h4.5"/><path d="M9.5 10.3v4M7.5 12.3h4"/></svg>
    case 'setujui-program':           // perisai + centang
      return <svg {...ICON_BOX}><path d="M10 2.5 4.5 4.3V9c0 3.4 2.3 5.9 5.5 7 3.2-1.1 5.5-3.6 5.5-7V4.3z"/><path d="m7.7 9.3 1.7 1.7 3.1-3.4"/></svg>
    case 'tambah-workstream-task':    // hierarki org
      return <svg {...ICON_BOX}><rect x="7.5" y="2.5" width="5" height="3.4" rx="1"/><rect x="2.5" y="13.5" width="5" height="3.4" rx="1"/><rect x="12.5" y="13.5" width="5" height="3.4" rx="1"/><path d="M10 5.9v2.8M5 13.5v-2.2a.6.6 0 0 1 .6-.6h8.8a.6.6 0 0 1 .6.6v2.2"/></svg>
    case 'update-progress':           // kolom papan kerja
      return <svg {...ICON_BOX}><rect x="2.5" y="3.5" width="4" height="13" rx="1"/><rect x="8" y="3.5" width="4" height="8.5" rx="1"/><rect x="13.5" y="3.5" width="4" height="5.5" rx="1"/></svg>
    case 'lapor-blocker-eskalasi':    // segitiga peringatan
      return <svg {...ICON_BOX}><path d="M10 3.2 2.8 16.2a.7.7 0 0 0 .6 1.05h13.2a.7.7 0 0 0 .6-1.05z"/><path d="M10 8v3.4M10 14.3h.01"/></svg>
    case 'buat-penugasan':            // kirim (paper-plane)
      return <svg {...ICON_BOX}><path d="M17.5 2.5 9 11"/><path d="M17.5 2.5 12 17.3l-3-6.3-6.3-3z"/></svg>
    case 'kerjakan-review-penugasan': // siklus + review
      return <svg {...ICON_BOX}><path d="M16.6 8A6.5 6.5 0 1 0 17 11.2"/><path d="M17.2 3.4v4.2h-4.2"/></svg>
    default:
      return <svg {...ICON_BOX}><circle cx="10" cy="10" r="7"/></svg>
  }
}

// Palet kategori terkurasi (satu hue per jenis aksi — bermakna, bukan acak).
// Level ~600 Tailwind: kaya tapi tidak neon, harmonis cool→warm. Memberi
// identitas + energi per kartu tanpa terkesan rainbow norak.
const TOPIK_ACCENT: Record<string, string> = {
  'buat-program':              '#4F46E5', // indigo — perencanaan
  'setujui-program':           '#0D9488', // teal — governance/approval
  'tambah-workstream-task':    '#7C3AED', // violet — struktur
  'update-progress':           '#D97706', // amber — eksekusi harian
  'lapor-blocker-eskalasi':    '#E11D48', // rose — hambatan/alert
  'buat-penugasan':            '#0284C7', // sky — delegasi
  'kerjakan-review-penugasan': '#059669', // emerald — siklus kerja
}

function BookOpenIcon(): ReactElement {
  return <svg {...ICON_BOX}><path d="M10 5.2C8.1 3.9 5.5 3.7 3.4 4.3a.8.8 0 0 0-.6.77v9.1c0 .5.47.86.97.77 1.9-.34 4.2-.1 6.23 1.06 2.03-1.16 4.33-1.4 6.23-1.06.5.09.97-.27.97-.77v-9.1a.8.8 0 0 0-.6-.77C14.5 3.7 11.9 3.9 10 5.2z"/><path d="M10 5.2v9.6"/></svg>
}
function BookIcon(): ReactElement {
  return <svg {...ICON_BOX}><path d="M5 2.8h9.2a.8.8 0 0 1 .8.8v11.6a1.4 1.4 0 0 0-1.4-1.4H5z"/><path d="M5 2.8A1.6 1.6 0 0 0 3.4 4.4v11.2A1.6 1.6 0 0 1 5 14"/></svg>
}
function InfoIcon(): ReactElement {
  return <svg {...ICON_BOX}><circle cx="10" cy="10" r="7.3"/><path d="M10 9.2v4M10 6.6h.01"/></svg>
}

// ── Content data ──────────────────────────────────────────────────────────────
//
// Tujuh topik task-oriented prioritas (per kesepakatan 25 Mei 2026):
//   1. Buat program kerja
//   2. Setujui program
//   3. Tambah workstream & task
//   4. Update progress task
//   5. Lapor blocker & eskalasi
//   6. Buat & berikan penugasan
//   7. Kerjakan & review penugasan
//
// Setiap topik punya struktur sama: judul, apa-itu 1-line, langkah 3-5,
// tips opsional, link ke playbook section untuk detail teknis.

type RoleScope = 'BOD' | 'KADIV' | 'KASUBDIV' | 'ASISTEN' | 'OFFICER' | 'ADMIN' | 'ALL'

type Langkah = {
  judul:     string
  deskripsi: string
  tip?:      string
}

type Topik = {
  slug:      string
  icon:      string
  judul:     string
  ringkas:   string
  audience:  RoleScope[]
  bacaMenit: number
  apa:       string
  langkah:   Langkah[]
  tips:      string[]
  playbook?: { anchor: string; label: string }
}

const TOPIK: Topik[] = [
  {
    slug:      'buat-program',
    icon:      '📋',
    judul:     'Create a work program',
    ringkas:   'Register a new strategic program or initiative in ATLAS',
    audience:  ['KADIV', 'KASUBDIV', 'ASISTEN', 'ADMIN'],
    bacaMenit: 2,
    apa:       'A work program is the largest planning unit — a container for a strategic initiative that you will break down into Workstreams, Tasks, and KPIs. A KADIV can activate it directly; a KASUBDIV or ASISTEN needs approval from their superior.',
    langkah: [
      { judul: 'Open the Programs menu',      deskripsi: 'Sidebar → Plan group → Programs.' },
      { judul: 'Click "+ Create Program"',    deskripsi: 'Button in the top-right corner of the page.' },
      { judul: 'Fill in the minimum fields',  deskripsi: 'Code, Name, a short Description, and the program Year. The default owner is you.' },
      { judul: 'Click Save',                  deskripsi: 'The program is created. KADIV: immediately ACTIVE. KASUBDIV: status PENDING_KADIV. ASISTEN: status DRAFT (you then need to click "Submit for Approval").', tip: 'As an ASISTEN, you can keep editing the draft before submitting it.' },
    ],
    tips: [
      'Once a program is ACTIVE, any change to commitment fields (target, deadline, KPI link) is recorded in the audit log and the relevant people are notified — this keeps everyone accountable.',
      'A "post-activation hint" banner appears to help you add the first Workstream (the Plan → Do bridge).',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 Program & Workstream' },
  },
  {
    slug:      'setujui-program',
    icon:      '✅',
    judul:     'Approve or reject a program',
    ringkas:   'Review a program submitted by your team',
    audience:  ['KASUBDIV', 'KADIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       'Programs created by a KASUBDIV or ASISTEN need your review. As a KASUBDIV you are the first reviewer for an ASISTEN; as a KADIV you are the final reviewer.',
    langkah: [
      { judul: 'Open a notification or Focus', deskripsi: 'A "Program awaiting your approval" item appears in Focus and the notification bell. Click it to open the program detail.' },
      { judul: 'Review the program content',  deskripsi: 'Check the Summary tab: description, target, owner, KPI link. Check the Structure tab if Workstreams already exist.' },
      { judul: 'Approve or Return',           deskripsi: 'Use the "Approve" / "Return" buttons in the top banner. Returning a program requires a reason; it goes back to DRAFT for the PIC to revise.' },
    ],
    tips: [
      'After approval, a confirmation toast appears along with an "On Track" badge on the program. The creator is notified as well.',
      'When rejecting, add a note so the PIC knows what to fix — it is linked to the REJECTED status.',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 Program Approval Flow' },
  },
  {
    slug:      'tambah-workstream-task',
    icon:      '🌳',
    judul:     'Add Workstreams & Tasks',
    ringkas:   'Build the work hierarchy: Workstream → Phase → Task',
    audience:  ['KADIV', 'KASUBDIV', 'ASISTEN', 'OFFICER'],
    bacaMenit: 3,
    apa:       'Once a program is ACTIVE, you break it down into work tracks (Workstreams), stages (Phases), and execution units (Tasks). Tasks are what appear on the Workboard and can be assigned to team members.',
    langkah: [
      { judul: 'Open the Program detail',      deskripsi: 'Click a program from the list, then open the Structure tab.' },
      { judul: 'Add a Workstream',             deskripsi: 'Click "+ New Workstream". Fill in the name, code, dates, and PIC.' },
      { judul: 'Add a Phase to the Workstream', deskripsi: 'Click the Workstream, then "+ Add Phase". Give it a name (e.g. "Document Collection", "Analysis", "Report Drafting").' },
      { judul: 'Add a Task to the Phase',      deskripsi: 'Click "+ Add Task" under the Phase. Fill in the title, priority, assignee, and target completion date.', tip: 'The new Task appears on the assignee’s Workboard.' },
    ],
    tips: [
      'The hierarchy is Program → Workstream → Phase → Task → Subtask. A Subtask is a small step-by-step checklist inside a Task and does not appear on the Workboard.',
      'If you just need a quick task without a Phase, create it directly from the Workboard with "+ New Task".',
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: '§5 How to Add a Task' },
  },
  {
    slug:      'update-progress',
    icon:      '⏱️',
    judul:     'Update daily task progress',
    ringkas:   'Move tasks between columns, log progress %, mark them done',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'The Workboard has 5 columns: Backlog → Ready → In Progress → In Review → Done. Move a task card between columns as its status changes.',
    langkah: [
      { judul: 'Open the Workboard',           deskripsi: 'Sidebar → Do group → Workboard. Or use the shortcut G E.' },
      { judul: 'Filter to your tasks',         deskripsi: 'Click the "My Tasks" tab to see only the tasks assigned to you.' },
      { judul: 'Click a task card',            deskripsi: 'The detail modal opens. Change the status from the dropdown, or drag the card between columns.' },
      { judul: 'Submit for review when done',  deskripsi: 'Move it to "In Review" and attach evidence, a link, or a note. The reviewer is notified.', tip: 'A backward transition (e.g. In Progress → Ready) requires a reason.' },
    ],
    tips: [
      'The ⚠ Blocked badge: if a blocker exists, the task stays in its current column but is flagged. Its progress history is preserved.',
      'When a task is Done, an "✓ On time" / "⚠ Late" badge appears automatically based on the deadline.',
      'WIP limit: if too many tasks are In Progress, the system reminds you so the team does not get overloaded.',
    ],
    playbook: { anchor: '8-eksekusi--papan-kerja-workboard', label: '§8 Workboard' },
  },
  {
    slug:      'lapor-blocker-eskalasi',
    icon:      '🚧',
    judul:     'Report blockers & escalate',
    ringkas:   'Log a blocker and request support from your superior (Clear the Path)',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'A Blocker is an obstacle that prevents a task from being completed. An Escalation (Clear the Path) is a fast track to request support from your superior when work is stuck — it can start from a blocker, a progress log, or be created ad-hoc.',
    langkah: [
      { judul: 'Open the blocked task detail', deskripsi: 'From the Workboard, click the task card.' },
      { judul: 'Click "+ Add Blocker"',        deskripsi: 'In the detail panel. Fill in a title, a description, and the severity (LOW / MEDIUM / HIGH).' },
      { judul: 'Save',                         deskripsi: 'The PIC and KADIV are notified automatically. The blocker feeds into the program’s Health Score.' },
      { judul: 'Escalate if needed',           deskripsi: 'Click "Request Support" on the blocker card, or from Home or the program detail. Add context and send. Your superior will triage it (Commit / Reroute / Decline).', tip: 'The escalation status shows up in your Focus; a superior who commits will set a due date.' },
    ],
    tips: [
      'Every blocker gets an automatic discussion channel — the conversation stays in the context of the obstacle.',
      'The escalation feature is enabled for the DKM Pilot (feature flag). If the button does not appear, it may not be enabled for your unit yet.',
    ],
    playbook: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: '§11 Blocker · §18 Escalation' },
  },
  {
    slug:      'buat-penugasan',
    icon:      '📨',
    judul:     'Create & delegate an assignment',
    ringkas:   'Give an ad-hoc task to your team, outside the Program structure',
    audience:  ['BOD', 'KADIV', 'KASUBDIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       'An Assignment is an ad-hoc task from a superior to a team member, outside the Program structure. It usually comes with completion evidence (file, link, or note).',
    langkah: [
      { judul: 'Open the Assignment page',     deskripsi: 'Sidebar → Do group → Assignment. Or use the shortcut G A.' },
      { judul: 'Click "+ New Assignment"',     deskripsi: 'Button in the top-right corner.' },
      { judul: 'Choose a recipient from the directory', deskripsi: 'The system shows a preview of the approval chain if the recipient needs approval first.' },
      { judul: 'Fill in the details & send',   deskripsi: 'Title, description, priority, target completion date, and the type of evidence expected. Click Send — the recipient is notified immediately.', tip: 'If the recipient is in a different directorate, ATLAS asks for a justification (cross-directorate policy).' },
    ],
    tips: [
      'Assignments do not count toward program KPIs, but they are recorded in the recipient’s Commitment Ledger (their commitment hit-rate).',
      'Status: Ready → In Progress → In Review → Done. Same as a Workboard Task.',
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
  {
    slug:      'kerjakan-review-penugasan',
    icon:      '🔄',
    judul:     'Work on & review an assignment',
    ringkas:   'As the assignee: do the work and upload evidence. As the reviewer: approve or return.',
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       'After you receive an assignment, you start working on it and upload completion evidence. The person who assigned it will either approve it or return it for revision.',
    langkah: [
      { judul: 'Open your assignment card',    deskripsi: 'Assignment → filter "Given to me". The card sits in the Ready column.' },
      { judul: 'Move it to In Progress',       deskripsi: 'Drag the card to the second column when you start working.' },
      { judul: 'Upload completion evidence',   deskripsi: 'Click the card, then upload a file, paste a link, or write a note, as requested by your superior.' },
      { judul: 'Move it to In Review',         deskripsi: 'The person who assigned it is notified.', tip: 'As the reviewer: click an In Review card, then Approve (moves it to Done) or Return (sends it back to In Progress with a reason).' },
    ],
    tips: [
      'Helpful filters: Mine / Given to me / Team / Awaiting review — use whichever fits your role at the moment.',
      'The evidence required is stated in the "Evidence type" field — you must attach it before you can submit for review.',
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
]

// ── Role-aware quick cards ───────────────────────────────────────────────────

type QuickCard = { label: string; sub: string; href: string }

function quickCardsForRole(role: string): QuickCard[] {
  if (role === 'BOD') return [
    { label: 'Executive Summary', sub: 'One-page snapshot + PPTX export',  href: '/executive' },
    { label: 'Scorecard',         sub: 'Directorate achievement ranking',  href: '/performance/scorecard' },
    { label: 'Roadmap',           sub: 'Visual portfolio timeline',        href: '/roadmap' },
  ]
  if (role === 'KADIV') return [
    { label: 'Executive Summary', sub: 'Snapshot of your directorate',     href: '/executive' },
    { label: 'Programs',          sub: 'Manage programs & approvals',      href: '/programs' },
    { label: 'Directorate KPIs',  sub: 'Collegial achievement across your team', href: '/performance/kolegial' },
  ]
  if (role === 'KASUBDIV') return [
    { label: 'Programs',          sub: 'Manage your division’s programs',  href: '/programs' },
    { label: 'Workboard',         sub: 'Track team tasks',                 href: '/execution' },
    { label: 'Division KPIs',     sub: 'Your division’s achievement',      href: '/performance/divisi' },
  ]
  // OFFICER, ASISTEN, default
  return [
    { label: 'Workboard',         sub: 'Your daily tasks',                 href: '/execution' },
    { label: 'Assignment',        sub: 'Ad-hoc tasks from your superior',  href: '/penugasan' },
    { label: 'My KPIs',           sub: 'Your personal KPI achievement',    href: '/performance/me' },
  ]
}

// ── FAQ data ─────────────────────────────────────────────────────────────────

const FAQ: Array<{ q: string; a: string; link?: { anchor: string; label: string } }> = [
  {
    q: 'Why can’t I edit my program?',
    a: 'A program that is going through approval (status PENDING_KASUB or PENDING_KADIV) is locked from editing, and the Edit button is hidden automatically. You can edit it again once it is approved (ACTIVE) or rejected (REJECTED/DRAFT). ADMIN and SUPERADMIN can edit at any time.',
    link: { anchor: '5-perencanaan--program--workstream', label: '§5 Program Editing Rules' },
  },
  {
    q: 'What’s the difference between Program Status and Work Status?',
    a: 'Program Status (On Track / At Risk / Delayed / Completed) is the strategic level — it answers "is the program healthy?". Work Status (Backlog / Ready / In Progress / In Review / Done) is the operator level — it answers "which stage of the pipeline is this in?". They are orthogonal — a program can be On Track while some of its tasks are still in the Backlog.',
    link: { anchor: 'glosarium-istilah', label: 'Glossary' },
  },
  {
    q: 'How do I request support from my superior?',
    a: 'Click the "Request Support" button that appears on Home, the Program detail, the Task panel, the Blocker panel, or a meeting Action Item detail. Add context and send. Your superior will triage it: Commit (accept with a due date), Reroute (hand it to a peer), or Decline (with a reason).',
    link: { anchor: '18-tindak-lanjut--eskalasi-clear-the-path', label: '§18 Escalation' },
  },
  {
    q: 'Why does my task show "⚠ Blocked"?',
    a: 'Your task is flagged `isBlocked` — either you or your superior reported an obstacle. It is not a separate status, so the task stays in its current column (e.g. "In Progress"). Hover over the badge to see the reason. Once the obstacle is resolved, toggle the flag off from the detail panel.',
    link: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: '§11 Blocker' },
  },
  {
    q: 'When should I use a Task vs an Assignment?',
    a: 'A Task is planned work that already sits within a Program / Workstream / Phase. An Assignment is an ad-hoc task from a superior, outside of any Program — usually situational. If the work has a clear, scheduled deliverable, use a Task. If it’s a quick request with no structure, use an Assignment.',
    link: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: '§9 Assignment' },
  },
  {
    q: 'How do I export a program Charter to PPTX?',
    a: 'Open the Program detail, click the "Charter" button in the header, then click "Export PPTX". A presentation-ready deck is downloaded. For a batch (multiple programs into one deck), use the Export Batch button on the Programs list.',
    link: { anchor: '6-perencanaan--charter-program-read-only', label: '§6 Charter' },
  },
  {
    q: 'Why don’t some sidebar menu items appear for me?',
    a: 'The sidebar is role-aware — items are hidden automatically based on your position. For example, Directorate KPIs are not shown to KASUBDIV and below; Executive Summary is shown to BOD/KADIV. You can still reach a page via its direct URL if you know the link, but the content may be empty or limited according to policy.',
  },
]

// ── Component ────────────────────────────────────────────────────────────────

type View = 'index' | 'topik' | 'konsep'

export default function PanduanView() {
  const { currentUser } = useWorkspace()
  const navigate = useInertiaNavigate()
  const [view,  setView]  = useState<View>('index')
  const [active, setActive] = useState<string | null>(null)
  const [query,  setQuery]  = useState('')

  const role = currentUser?.roleType ?? 'OFFICER'
  const greetName = currentUser?.name ?? 'there'
  const quickCards = useMemo(() => quickCardsForRole(role), [role])

  const filteredTopik = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPIK
    return TOPIK.filter(t =>
      t.judul.toLowerCase().includes(q) ||
      t.ringkas.toLowerCase().includes(q) ||
      t.apa.toLowerCase().includes(q),
    )
  }, [query])

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ
    return FAQ.filter(f =>
      f.q.toLowerCase().includes(q) ||
      f.a.toLowerCase().includes(q),
    )
  }, [query])

  const openTopik = (slug: string) => {
    setActive(slug)
    setView('topik')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
  const backToIndex = () => {
    setView('index')
    setActive(null)
  }

  const activeTopik = active ? TOPIK.find(t => t.slug === active) : null

  const openKonsep = () => {
    setView('konsep')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // ── Konsep Hierarki detail view ────────────────────────────────────────────
  if (view === 'konsep') {
    return <PanduanKonsepHierarki onBack={backToIndex} />
  }

  // ── Topik detail view ──────────────────────────────────────────────────────
  if (view === 'topik' && activeTopik) {
    return (
      <>
      <Head title={`${activeTopik.judul} — Help Center`} />
      <div className="panduan">
        <div className="panduan__inner panduan__inner--reading ds-stagger" key={`topik-${activeTopik.slug}`}>
          <button type="button" className="panduan__back" onClick={backToIndex}>
            ← Back to Help Center
          </button>

          <header className="panduan__topik-head" style={{ '--tc': TOPIK_ACCENT[activeTopik.slug] ?? 'var(--green)' } as CSSProperties}>
            <span className="panduan__topik-icon" aria-hidden="true"><TopikIcon slug={activeTopik.slug} /></span>
            <div className="panduan__topik-head-text">
              <h1 className="panduan__topik-title">{activeTopik.judul}</h1>
              <p className="panduan__topik-meta">
                For: {activeTopik.audience.includes('ALL') ? 'All roles' : activeTopik.audience.join(' · ')}
                <span className="panduan__topik-meta-sep" aria-hidden="true">•</span>
                {activeTopik.bacaMenit} min read
              </p>
            </div>
          </header>

          <section className="panduan__apa">
            <span className="panduan__apa-icon" aria-hidden="true"><InfoIcon /></span>
            <div className="panduan__apa-body">
              <span className="panduan__apa-label">What is this?</span>
              <p className="panduan__apa-text">{activeTopik.apa}</p>
            </div>
          </section>

          <section className="panduan__langkah-section">
            <h2 className="panduan__sec-title">Quick steps</h2>
            <ol className="panduan__langkah">
              {activeTopik.langkah.map((l, i) => (
                <li className="panduan__langkah-item" key={i}>
                  <span className="panduan__langkah-num">{i + 1}</span>
                  <div className="panduan__langkah-body">
                    <h3 className="panduan__langkah-judul">{l.judul}</h3>
                    <p className="panduan__langkah-desc">{l.deskripsi}</p>
                    {l.tip && <p className="panduan__langkah-tip"><span className="panduan__langkah-tip-label">Tip</span>{l.tip}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {activeTopik.tips.length > 0 && (
            <section className="panduan__tips-section">
              <h2 className="panduan__sec-title">Tips</h2>
              <ul className="panduan__tips">
                {activeTopik.tips.map((t, i) => (
                  <li className="panduan__tips-item" key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {activeTopik.playbook && (
            <section className="panduan__playbook-link">
              <span className="panduan__playbook-link-icon" aria-hidden="true"><BookIcon /></span>
              <span>Learn more in the Playbook:{' '}
                <a
                  href={`/playbook#${activeTopik.playbook.anchor}`}
                  onClick={e => { e.preventDefault(); navigate(`/playbook#${activeTopik.playbook!.anchor}`) }}
                  className="panduan__playbook-link-anchor"
                >
                  {activeTopik.playbook.label}
                </a>
              </span>
            </section>
          )}
        </div>
      </div>
      </>
    )
  }

  // ── Index view ────────────────────────────────────────────────────────────
  return (
    <>
    <Head title="Help Center" />
    <div className="panduan">
      <div className="panduan__inner ds-stagger" key="panduan-index">
        {/* Hero */}
        <header className="panduan__hero">
          <span className="panduan__hero-eyebrow">Help Center</span>
          <h1 className="panduan__hero-title">Hello, {greetName}</h1>
          <p className="panduan__hero-sub">
            Find step-by-step guides, quick answers, and the full ATLAS documentation.
          </p>
          <div className="panduan__hero-quick-head">
            <span className="panduan__hero-quick-label">Quick access for <strong>{role}</strong></span>
          </div>
          <div className="panduan__hero-cards">
            {quickCards.map((c, idx) => (
              <Link key={c.href} href={c.href} className="panduan__hero-card" style={{ '--hero-card-idx': idx } as CSSProperties}>
                <span className="panduan__hero-card-icon" aria-hidden="true">
                  <QuickCardIcon href={c.href} />
                </span>
                <span className="panduan__hero-card-body">
                  <span className="panduan__hero-card-label">{c.label}</span>
                  <span className="panduan__hero-card-sub">{c.sub}</span>
                </span>
                <span className="panduan__hero-card-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </header>

        {/* Search */}
        <div className="panduan__search-wrap">
          <svg className="panduan__search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="6" cy="6" r="4.5" />
            <path d="m9.5 9.5 3 3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search help topics, e.g. 'escalation' or 'kpi'…"
            className="panduan__search"
            aria-label="Search help topics"
          />
          {query
            ? <button type="button" onClick={() => setQuery('')} className="panduan__search-clear" aria-label="Clear search">×</button>
            : <kbd className="panduan__search-kbd" aria-hidden="true">{filteredTopik.length + filteredFaq.length} items</kbd>
          }
        </div>

        {/* Foundational concept banner — Program/Workstream/Phase/Task explainer */}
        <button type="button" className="panduan__concept-banner" onClick={openKonsep}>
          <span className="panduan__concept-banner-icon" aria-hidden="true"><BookOpenIcon /></span>
          <span className="panduan__concept-banner-body">
            <span className="panduan__concept-banner-title">New to ATLAS?</span>
            <span className="panduan__concept-banner-sub">
              Learn the difference between <strong>Program</strong>, <strong>Workstream</strong>,
              <strong> Phase</strong>, and <strong>Task</strong> — with full examples.
            </span>
          </span>
          <span className="panduan__concept-banner-arrow" aria-hidden="true">→</span>
        </button>

        {/* Topik task-oriented */}
        <section className="panduan__topiks">
          <h2 className="panduan__sec-title">
            What would you like to do?
            <span className="panduan__sec-count">{filteredTopik.length}</span>
          </h2>
          {filteredTopik.length === 0 ? (
            <p className="panduan__empty">No topics match "{query}".</p>
          ) : (
            <div className="panduan__topik-grid">
              {filteredTopik.map(t => (
                <button
                  key={t.slug}
                  type="button"
                  className="panduan__topik-card"
                  style={{ '--tc': TOPIK_ACCENT[t.slug] ?? 'var(--green)' } as CSSProperties}
                  onClick={() => openTopik(t.slug)}
                >
                  <span className="panduan__topik-card-icon" aria-hidden="true"><TopikIcon slug={t.slug} /></span>
                  <div className="panduan__topik-card-body">
                    <h3 className="panduan__topik-card-judul">{t.judul}</h3>
                    <p className="panduan__topik-card-ringkas">{t.ringkas}</p>
                    <span className="panduan__topik-card-meta">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><path d="M6 3.5V6l1.8 1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {t.bacaMenit} min read
                    </span>
                  </div>
                  <span className="panduan__topik-card-arrow" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section className="panduan__faq">
          <h2 className="panduan__sec-title">
            Frequently asked questions
            <span className="panduan__sec-count">{filteredFaq.length}</span>
          </h2>
          {filteredFaq.length === 0 ? (
            <p className="panduan__empty">No questions match "{query}".</p>
          ) : (
            <ul className="panduan__faq-list">
              {filteredFaq.map((f, i) => (
                <li key={i}>
                  <details className="panduan__faq-item">
                    <summary className="panduan__faq-q">{f.q}</summary>
                    <div className="panduan__faq-a">
                      <p>{f.a}</p>
                      {f.link && (
                        <a
                          href={`/playbook#${f.link.anchor}`}
                          onClick={e => { e.preventDefault(); navigate(`/playbook#${f.link!.anchor}`) }}
                          className="panduan__faq-link"
                        >
                          {f.link.label}
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 7h7M6.5 3.5 10 7l-3.5 3.5"/></svg>
                        </a>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer link ke Playbook lengkap */}
        <footer className="panduan__footer">
          <div className="panduan__footer-card">
            <span className="panduan__footer-icon" aria-hidden="true"><BookIcon /></span>
            <div className="panduan__footer-text">
              <h3 className="panduan__footer-title">Need the full technical detail?</h3>
              <p className="panduan__footer-sub">
                The full Playbook contains 23 workflows, a technical glossary, system process flows, and implementation tables.
              </p>
            </div>
            <Link href="/playbook" className="panduan__footer-link">
              Open Playbook
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5h8M7 3.5 11 7.5l-4 4"/></svg>
            </Link>
          </div>
        </footer>
      </div>
    </div>
    </>
  )
}
