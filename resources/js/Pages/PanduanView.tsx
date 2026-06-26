import { useMemo, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Head, Link } from '@inertiajs/react'
import { useTranslation } from 'react-i18next'
import i18n from '../lib/i18n'
import { useWorkspace } from '../hooks/useWorkspace'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import PanduanKonsepHierarki from './PanduanKonsepHierarki'
import './PanduanView.css'

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

const getTopik = (): Topik[] => [
  {
    slug:      'buat-program',
    icon:      '📋',
    judul:     i18n.t('Create a work program'),
    ringkas:   i18n.t('Register a new strategic program or initiative in ATLAS'),
    audience:  ['KADIV', 'KASUBDIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       i18n.t('A work program is the largest planning unit — a container for a strategic initiative that you will break down into Workstreams, Tasks, and KPIs. Only a KADIV or KASUBDIV (or an admin) can author a program and be its owner — ASISTEN and OFFICER are executors. A KADIV can activate it directly; a KASUBDIV needs approval from a KADIV.'),
    langkah: [
      { judul: i18n.t('Open the Programs menu'),      deskripsi: i18n.t('Programs is pinned at the top of the sidebar.') },
      { judul: i18n.t('Click "+ Create Program"'),    deskripsi: i18n.t('Button in the top-right corner of the page.') },
      { judul: i18n.t('Fill in the minimum fields'),  deskripsi: i18n.t('Code, Name, a short Description, and the program Year. The default owner is you (KADIV/KASUBDIV).') },
      { judul: i18n.t('Click Save'),                  deskripsi: i18n.t('The program is created. KADIV: immediately ACTIVE. KASUBDIV: status PENDING_KADIV, awaiting a KADIV’s approval.') },
    ],
    tips: [
      i18n.t('Once a program is ACTIVE, any change to commitment fields (target, deadline, KPI link) is recorded in the audit log and the relevant people are notified — this keeps everyone accountable.'),
      i18n.t('A "post-activation hint" banner appears to help you add the first Workstream (the Plan → Do bridge).'),
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: i18n.t('§5 Program & Workstream') },
  },
  {
    slug:      'setujui-program',
    icon:      '✅',
    judul:     i18n.t('Approve or reject a program'),
    ringkas:   i18n.t('Review a program submitted by your team'),
    audience:  ['KADIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       i18n.t('Programs created by a KASUBDIV need a KADIV’s review before they go ACTIVE. As a KADIV you are the approver.'),
    langkah: [
      { judul: i18n.t('Open a notification or Focus'), deskripsi: i18n.t('A "Program awaiting your approval" item appears in Focus and the notification bell. Click it to open the program detail.') },
      { judul: i18n.t('Review the program content'),  deskripsi: i18n.t('Check the Summary tab: description, target, owner, KPI link. Check the Structure tab if Workstreams already exist.') },
      { judul: i18n.t('Approve or Return'),           deskripsi: i18n.t('Use the "Approve" / "Return" buttons in the top banner. Returning a program requires a reason; it goes back to DRAFT for the PIC to revise.') },
    ],
    tips: [
      i18n.t('After approval, a confirmation toast appears along with an "On Track" badge on the program. The creator is notified as well.'),
      i18n.t('When rejecting, add a note so the PIC knows what to fix — it is linked to the REJECTED status.'),
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: i18n.t('§5 Program Approval Flow') },
  },
  {
    slug:      'tambah-workstream-task',
    icon:      '🌳',
    judul:     i18n.t('Add Workstreams & Tasks'),
    ringkas:   i18n.t('Build the work hierarchy: Workstream → Phase → Task'),
    audience:  ['KADIV', 'KASUBDIV', 'ADMIN'],
    bacaMenit: 3,
    apa:       i18n.t('Once a program is ACTIVE, the owner (KADIV/KASUBDIV) breaks it down into work tracks (Workstreams), stages (Phases), and execution units (Tasks). Tasks are what appear on the Workboard and can be assigned to team members — including ASISTEN and OFFICER, who execute the work.'),
    langkah: [
      { judul: i18n.t('Open the Program detail'),      deskripsi: i18n.t('Click a program from the list, then open the Structure tab.') },
      { judul: i18n.t('Add a Workstream'),             deskripsi: i18n.t('Click "+ New Workstream". Fill in the name, code, priority, and dates. (Workstreams no longer have their own owner/PIC — accountability sits with the program PIC and each task’s assignee.)') },
      { judul: i18n.t('Add a Phase to the Workstream'), deskripsi: i18n.t('Click the Workstream, then "+ Add Phase". Give it a name (e.g. "Document Collection", "Analysis", "Report Drafting").') },
      { judul: i18n.t('Add a Task to the Phase'),      deskripsi: i18n.t('Click "+ Add Task" under the Phase. Fill in the title, priority, assignee, and target completion date.'), tip: i18n.t('The new Task appears on the assignee’s Workboard.') },
    ],
    tips: [
      i18n.t('The hierarchy is Program → Workstream → Phase → Task → Subtask. A Subtask is a small step-by-step checklist inside a Task and does not appear on the Workboard.'),
      i18n.t('If you just need a quick task without a Phase, create it directly from the Workboard with "+ New Task".'),
    ],
    playbook: { anchor: '5-perencanaan--program--workstream', label: i18n.t('§5 How to Add a Task') },
  },
  {
    slug:      'update-progress',
    icon:      '⏱️',
    judul:     i18n.t('Update daily task progress'),
    ringkas:   i18n.t('Update status, log progress %, mark tasks done'),
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       i18n.t('The Workboard has four views: By Program (the default — tasks grouped under their program), Board (a kanban organized by schedule urgency: Overdue · At Risk · On Track · Not Started · Completed), List, and Blockers. You update a task from its detail panel — card positions are derived from schedule and progress, not dragged.'),
    langkah: [
      { judul: i18n.t('Open the Workboard'),           deskripsi: i18n.t('Sidebar → My Work → Workboard. Or use the shortcut G E.') },
      { judul: i18n.t('Filter to your tasks'),         deskripsi: i18n.t('Use the "My Tasks" filter to see only the tasks assigned to you. Switch views (By Program / Board / List / Blockers) from the tabs at the top.') },
      { judul: i18n.t('Click a task card'),            deskripsi: i18n.t('The detail modal opens. Change the status from the Status dropdown and log your progress %.') },
      { judul: i18n.t('Mark it done with evidence'),   deskripsi: i18n.t('Move it to Completed and attach evidence — a link or a note. Its progress history (start, completion) is kept.'), tip: i18n.t('A backward transition (e.g. In Progress → Ready) requires a reason.') },
    ],
    tips: [
      i18n.t('The ⚠ Blocked badge: if a blocker exists, the task stays in its current column but is flagged. Its progress history is preserved.'),
      i18n.t('When a task is Done, an "✓ On time" / "⚠ Late" badge appears automatically based on the deadline.'),
      i18n.t('WIP limit: if too many tasks are In Progress, the system reminds you so the team does not get overloaded.'),
    ],
    playbook: { anchor: '8-eksekusi--papan-kerja-workboard', label: i18n.t('§8 Workboard') },
  },
  {
    slug:      'lapor-blocker-eskalasi',
    icon:      '🚧',
    judul:     i18n.t('Report blockers & escalate'),
    ringkas:   i18n.t('Log a blocker and request support from your superior (Clear the Path)'),
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       i18n.t('A Blocker is an obstacle that prevents a task from being completed. An Escalation (Clear the Path) is a fast track to request support from your superior when work is stuck — it can start from a blocker, a progress log, or be created ad-hoc.'),
    langkah: [
      { judul: i18n.t('Open the blocked task detail'), deskripsi: i18n.t('From the Workboard, click the task card.') },
      { judul: i18n.t('Click "+ Add Blocker"'),        deskripsi: i18n.t('In the detail panel. Fill in a title, a description, and the severity (LOW / MEDIUM / HIGH).') },
      { judul: i18n.t('Save'),                         deskripsi: i18n.t('The PIC and KADIV are notified automatically. The blocker feeds into the program’s Health Score.') },
      { judul: i18n.t('Escalate if needed'),           deskripsi: i18n.t('Click "Request Support" on the blocker card, or from Home or the program detail. Add context and send. Your superior will triage it (Commit / Reroute / Decline).'), tip: i18n.t('The escalation status shows up in your Focus; a superior who commits will set a due date.') },
    ],
    tips: [
      i18n.t('Every blocker gets an automatic discussion channel — the conversation stays in the context of the obstacle.'),
      i18n.t('The escalation feature is enabled for the DKM Pilot (feature flag). If the button does not appear, it may not be enabled for your unit yet.'),
    ],
    playbook: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: i18n.t('§11 Blocker · §18 Escalation') },
  },
  {
    slug:      'buat-penugasan',
    icon:      '📨',
    judul:     i18n.t('Create & delegate an assignment'),
    ringkas:   i18n.t('Give an ad-hoc task to your team, outside the Program structure'),
    audience:  ['BOD', 'KADIV', 'KASUBDIV', 'ADMIN'],
    bacaMenit: 2,
    apa:       i18n.t('An Assignment is an ad-hoc task from a superior to a team member, outside the Program structure. It usually comes with completion evidence (file, link, or note).'),
    langkah: [
      { judul: i18n.t('Open the Assignment page'),     deskripsi: i18n.t('Sidebar → My Work → Assignment. Or use the shortcut G A.') },
      { judul: i18n.t('Click "+ New Assignment"'),     deskripsi: i18n.t('Button in the top-right corner.') },
      { judul: i18n.t('Choose a recipient from the directory'), deskripsi: i18n.t('The system shows a preview of the approval chain if the recipient needs approval first.') },
      { judul: i18n.t('Fill in the details & send'),   deskripsi: i18n.t('Title, description, priority, target completion date, and the type of evidence expected. Click Send — the recipient is notified immediately.'), tip: i18n.t('If the recipient is in a different directorate, ATLAS asks for a justification (cross-directorate policy).') },
    ],
    tips: [
      i18n.t('Assignments do not count toward program KPIs, but they are recorded in the recipient’s Commitment Ledger (their commitment hit-rate).'),
      i18n.t('Status: Ready → In Progress → In Review → Done. Same as a Workboard Task.'),
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: i18n.t('§9 Assignment') },
  },
  {
    slug:      'kerjakan-review-penugasan',
    icon:      '🔄',
    judul:     i18n.t('Work on & review an assignment'),
    ringkas:   i18n.t('As the assignee: do the work and upload evidence. As the reviewer: approve or return.'),
    audience:  ['ALL'],
    bacaMenit: 2,
    apa:       i18n.t('After you receive an assignment, you start working on it and upload completion evidence. The person who assigned it will either approve it or return it for revision.'),
    langkah: [
      { judul: i18n.t('Open your assignment card'),    deskripsi: i18n.t('Assignment → filter "Given to me". The card sits in the Ready column.') },
      { judul: i18n.t('Move it to In Progress'),       deskripsi: i18n.t('Drag the card to the second column when you start working.') },
      { judul: i18n.t('Upload completion evidence'),   deskripsi: i18n.t('Click the card, then upload a file, paste a link, or write a note, as requested by your superior.') },
      { judul: i18n.t('Move it to In Review'),         deskripsi: i18n.t('The person who assigned it is notified.'), tip: i18n.t('As the reviewer: click an In Review card, then Approve (moves it to Done) or Return (sends it back to In Progress with a reason).') },
    ],
    tips: [
      i18n.t('Helpful filters: Mine / Given to me / Team / Awaiting review — use whichever fits your role at the moment.'),
      i18n.t('The evidence required is stated in the "Evidence type" field — you must attach it before you can submit for review.'),
    ],
    playbook: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: i18n.t('§9 Assignment') },
  },
]

// ── FAQ data ─────────────────────────────────────────────────────────────────

const getFaq = (): Array<{ q: string; a: string; link?: { anchor: string; label: string } }> => [
  {
    q: i18n.t('Why can’t I edit my program?'),
    a: i18n.t('A program that is going through approval (status PENDING_KASUB or PENDING_KADIV) is locked from editing, and the Edit button is hidden automatically. You can edit it again once it is approved (ACTIVE) or rejected (REJECTED/DRAFT). ADMIN and SUPERADMIN can edit at any time.'),
    link: { anchor: '5-perencanaan--program--workstream', label: i18n.t('§5 Program Editing Rules') },
  },
  {
    q: i18n.t('What’s the difference between Program Status and Work Status?'),
    a: i18n.t('Program Status (On Track / At Risk / Delayed / Completed) is the strategic, schedule/health level — it answers "is the program healthy?". Work Status (Backlog / Ready / In Progress / In Review / Completed) is the operator, lifecycle level — it answers "which stage of the pipeline is this in?". They are orthogonal — a program can be On Track while some of its tasks are still in the Backlog. The Workboard Board view groups tasks by the schedule axis (Overdue / At Risk / On Track / Not Started / Completed).'),
    link: { anchor: 'glosarium-istilah', label: i18n.t('Glossary') },
  },
  {
    q: i18n.t('How do I request support from my superior?'),
    a: i18n.t('Click the "Request Support" button that appears on Home, the Program detail, the Task panel, the Blocker panel, or a meeting Action Item detail. Add context and send. Your superior will triage it: Commit (accept with a due date), Reroute (hand it to a peer), or Decline (with a reason).'),
    link: { anchor: '18-tindak-lanjut--eskalasi-clear-the-path', label: i18n.t('§18 Escalation') },
  },
  {
    q: i18n.t('Why does my task show "⚠ Blocked"?'),
    a: i18n.t('Your task is flagged `isBlocked` — either you or your superior reported an obstacle. It is not a separate status; it is a flag layered on top of the task’s lifecycle status. On the Board its card moves to the At Risk column (or Overdue if it is already past due). Hover over the badge to see the reason. Once the obstacle is resolved, toggle the flag off from the detail panel.'),
    link: { anchor: '11-eksekusi--blocker-hambatan-kerja', label: i18n.t('§11 Blocker') },
  },
  {
    q: i18n.t('When should I use a Task vs an Assignment?'),
    a: i18n.t('A Task is planned work that already sits within a Program / Workstream / Phase. An Assignment is an ad-hoc task from a superior, outside of any Program — usually situational. If the work has a clear, scheduled deliverable, use a Task. If it’s a quick request with no structure, use an Assignment.'),
    link: { anchor: '9-eksekusi--penugasan-ad-hoc-task', label: i18n.t('§9 Assignment') },
  },
  {
    q: i18n.t('How do I export a program Charter to PPTX?'),
    a: i18n.t('Open the Program detail, click the "Charter" button in the header, then click "Export PPTX". A presentation-ready deck is downloaded. For a batch (multiple programs into one deck), use the Export Batch button on the Programs list.'),
    link: { anchor: '6-perencanaan--charter-program-read-only', label: i18n.t('§6 Charter') },
  },
  {
    q: i18n.t('Why don’t some sidebar menu items appear for me?'),
    a: i18n.t('The sidebar is intent-based and role-aware — items are hidden automatically based on your access. Everyone sees the pinned top of the sidebar (Home, Focus, Programs) and the My Work group (Workboard, Assignment, Coordination, Channels, Presence). The Performance group (Scorecard, Directorate & Division KPI) only appears for directorates with performance access, and is hidden entirely otherwise; Executive Summary and the Leaderboard are SUPERADMIN-only; the Admin group is visible only to admins. You can still reach a page via its direct URL if you know the link, but the content may be empty or limited according to policy.'),
  },
  {
    q: i18n.t('How do I switch language or turn on dark mode?'),
    a: i18n.t('Open Settings from your avatar menu (bottom of the sidebar). Under Appearance, choose Light, Dark, or System (which follows your device). Under Language, switch between English and Bahasa Indonesia — the whole interface, including status labels, updates instantly. Your choices are saved on this device.'),
  },
  {
    q: i18n.t('How do I look up a teammate or mention them?'),
    a: i18n.t('Click any person — their name or avatar, anywhere in ATLAS (Presence, Channels, an assignment, a task comment, a meeting) — to open a read-only profile card showing their position, supervisor, and current workload. Click their photo to view it full-size. In a task or program discussion, type @ to mention a teammate; they get a notification linking straight to the comment.'),
  },
  {
    q: i18n.t('How do I get around on my phone?'),
    a: i18n.t('On phones (≤640px) ATLAS uses a mobile-native layout. A bottom tab bar gives you Home, Workboard, Programs, and Channels; the Menu tab opens the full menu as a grid. Home becomes a launcher with a search pill — tap it to open the command palette. You can also install ATLAS to your home screen as an app (PWA).'),
  },
]

// ── Component ────────────────────────────────────────────────────────────────

type View = 'index' | 'topik' | 'konsep'

export default function PanduanView() {
  const { t } = useTranslation()
  const { currentUser } = useWorkspace()
  const navigate = useInertiaNavigate()
  const [view,  setView]  = useState<View>('index')
  const [active, setActive] = useState<string | null>(null)
  const [query,  setQuery]  = useState('')

  const greetName = currentUser?.name ?? t('there')

  const TOPIK = useMemo(() => getTopik(), [])
  const FAQ = useMemo(() => getFaq(), [])

  const filteredTopik = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TOPIK
    return TOPIK.filter(t =>
      t.judul.toLowerCase().includes(q) ||
      t.ringkas.toLowerCase().includes(q) ||
      t.apa.toLowerCase().includes(q),
    )
  }, [query, TOPIK])

  const filteredFaq = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ
    return FAQ.filter(f =>
      f.q.toLowerCase().includes(q) ||
      f.a.toLowerCase().includes(q),
    )
  }, [query, FAQ])

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
      <Head title={`${activeTopik.judul} — ${t('Help Center')}`} />
      <div className="panduan">
        <div className="panduan__inner panduan__inner--reading ds-stagger" key={`topik-${activeTopik.slug}`}>
          <button type="button" className="panduan__back" onClick={backToIndex}>
            ← {t('Back to Help Center')}
          </button>

          <header className="panduan__topik-head" style={{ '--tc': TOPIK_ACCENT[activeTopik.slug] ?? 'var(--green)' } as CSSProperties}>
            <span className="panduan__topik-icon" aria-hidden="true"><TopikIcon slug={activeTopik.slug} /></span>
            <div className="panduan__topik-head-text">
              <h1 className="panduan__topik-title">{activeTopik.judul}</h1>
              <p className="panduan__topik-meta">
                {t('For:')} {activeTopik.audience.includes('ALL') ? t('All roles') : activeTopik.audience.join(' · ')}
                <span className="panduan__topik-meta-sep" aria-hidden="true">•</span>
                {t('{{count}} min read', { count: activeTopik.bacaMenit })}
              </p>
            </div>
          </header>

          <section className="panduan__apa">
            <span className="panduan__apa-icon" aria-hidden="true"><InfoIcon /></span>
            <div className="panduan__apa-body">
              <span className="panduan__apa-label">{t('What is this?')}</span>
              <p className="panduan__apa-text">{activeTopik.apa}</p>
            </div>
          </section>

          <section className="panduan__langkah-section">
            <h2 className="panduan__sec-title">{t('Quick steps')}</h2>
            <ol className="panduan__langkah">
              {activeTopik.langkah.map((l, i) => (
                <li className="panduan__langkah-item" key={i}>
                  <span className="panduan__langkah-num">{i + 1}</span>
                  <div className="panduan__langkah-body">
                    <h3 className="panduan__langkah-judul">{l.judul}</h3>
                    <p className="panduan__langkah-desc">{l.deskripsi}</p>
                    {l.tip && <p className="panduan__langkah-tip"><span className="panduan__langkah-tip-label">{t('Tip')}</span>{l.tip}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {activeTopik.tips.length > 0 && (
            <section className="panduan__tips-section">
              <h2 className="panduan__sec-title">{t('Tips')}</h2>
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
              <span>{t('Learn more in the Playbook:')}{' '}
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
    <Head title={t('Help Center')} />
    <div className="panduan">
      <div className="panduan__inner ds-stagger" key="panduan-index">
        {/* Hero */}
        <header className="panduan__hero">
          <span className="panduan__hero-eyebrow">{t('Help Center')}</span>
          <h1 className="panduan__hero-title">{t('Hello, {{name}}', { name: greetName })}</h1>
          <p className="panduan__hero-sub">
            {t('Find step-by-step guides, quick answers, and the full ATLAS documentation.')}
          </p>
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
            placeholder={t("Search help topics, e.g. 'escalation' or 'kpi'…")}
            className="panduan__search"
            aria-label={t('Search help topics')}
          />
          {query
            ? <button type="button" onClick={() => setQuery('')} className="panduan__search-clear" aria-label={t('Clear search')}>×</button>
            : <kbd className="panduan__search-kbd" aria-hidden="true">{t('{{count}} items', { count: filteredTopik.length + filteredFaq.length })}</kbd>
          }
        </div>

        {/* Foundational concept banner — Program/Workstream/Phase/Task explainer */}
        <button type="button" className="panduan__concept-banner" onClick={openKonsep}>
          <span className="panduan__concept-banner-icon" aria-hidden="true"><BookOpenIcon /></span>
          <span className="panduan__concept-banner-body">
            <span className="panduan__concept-banner-title">{t('New to ATLAS?')}</span>
            <span className="panduan__concept-banner-sub">
              {t('Learn the difference between')} <strong>{t('Program')}</strong>, <strong>{t('Workstream')}</strong>,
              <strong> {t('Phase')}</strong>, {t('and')} <strong>{t('Task')}</strong> {t('— with full examples.')}
            </span>
          </span>
          <span className="panduan__concept-banner-arrow" aria-hidden="true">→</span>
        </button>

        {/* Topik task-oriented */}
        <section className="panduan__topiks">
          <h2 className="panduan__sec-title">
            {t('What would you like to do?')}
            <span className="panduan__sec-count">{filteredTopik.length}</span>
          </h2>
          {filteredTopik.length === 0 ? (
            <p className="panduan__empty">{t('No topics match "{{query}}".', { query })}</p>
          ) : (
            <div className="panduan__topik-grid">
              {filteredTopik.map(topik => (
                <button
                  key={topik.slug}
                  type="button"
                  className="panduan__topik-card"
                  style={{ '--tc': TOPIK_ACCENT[topik.slug] ?? 'var(--green)' } as CSSProperties}
                  onClick={() => openTopik(topik.slug)}
                >
                  <span className="panduan__topik-card-icon" aria-hidden="true"><TopikIcon slug={topik.slug} /></span>
                  <div className="panduan__topik-card-body">
                    <h3 className="panduan__topik-card-judul">{topik.judul}</h3>
                    <p className="panduan__topik-card-ringkas">{topik.ringkas}</p>
                    <span className="panduan__topik-card-meta">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><path d="M6 3.5V6l1.8 1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {t('{{count}} min read', { count: topik.bacaMenit })}
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
            {t('Frequently asked questions')}
            <span className="panduan__sec-count">{filteredFaq.length}</span>
          </h2>
          {filteredFaq.length === 0 ? (
            <p className="panduan__empty">{t('No questions match "{{query}}".', { query })}</p>
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
              <h3 className="panduan__footer-title">{t('Need the full technical detail?')}</h3>
              <p className="panduan__footer-sub">
                {t('The full Playbook contains 23 workflows, a technical glossary, system process flows, and implementation tables.')}
              </p>
            </div>
            <Link href="/playbook" className="panduan__footer-link">
              {t('Open Playbook')}
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5h8M7 3.5 11 7.5l-4 4"/></svg>
            </Link>
          </div>
        </footer>
      </div>
    </div>
    </>
  )
}
