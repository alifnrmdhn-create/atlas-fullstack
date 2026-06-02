/**
 * Post-MVP — Onboarding Tour Definitions (Shepherd.js).
 *
 * Setiap tour adalah array of step. Lazy import shepherd.js supaya tidak
 * membebani initial bundle.
 *
 * Convention:
 *   - Setiap step `attachTo` ke selector — kalau tidak ditemukan, step skip
 *     (Shepherd default behavior)
 *   - Step terakhir tutup tour + mark completed di backend
 *   - Tour ID dipakai sebagai key di User.toursCompleted JSON
 */

export type TourId =
  | 'pdca-orientation'       // pertama login user — overview alur PDCA
  | 'escalation-inbox'       // pertama buka Inbox dengan section escalation
  | 'clear-path-button'      // pertama lihat tombol "Butuh Dukungan Atasan"
  | 'triage-panel'           // pertama buka triage panel (atasan)
  | 'commitment-ledger'      // pertama akses Komitmen Saya

export type TourStep = {
  id: string
  title: string
  text: string
  attachTo?: { element: string; on: 'top' | 'bottom' | 'left' | 'right' }
  buttons?: Array<{ text: string; type?: 'next' | 'back' | 'cancel' | 'complete' }>
}

export const TOURS: Record<TourId, TourStep[]> = {
  'pdca-orientation': [
    {
      id: 'welcome',
      title: 'Welcome to ATLAS',
      text: 'ATLAS follows the <strong>PDCA</strong> cycle — Plan, Do, Check, Act. This quick tour points out those four phases in the left sidebar. ~30 seconds.',
    },
    {
      id: 'plan',
      title: '1. Plan',
      text: 'Start here. Create a program, break it into workstreams, then tasks. Add the KPIs you will measure. Once it is ready to execute, the KADIV approves it to move to the next phase.',
      attachTo: { element: '.sidebar a[href="/programs"]', on: 'right' },
    },
    {
      id: 'do',
      title: '2. Do',
      text: 'The Workboard shows the team\'s daily tasks. The PIC updates status (BACKLOG → IN_PROGRESS → COMPLETED), uploads evidence, and logs weekly progress from the program Summary tab.',
      attachTo: { element: '.sidebar a[href="/execution"]', on: 'right' },
    },
    {
      id: 'check',
      title: '3. Check — Monitor performance',
      text: 'Review the program portfolio summary and each directorate\'s KPI achievement in Performance. Home (this page) also shows a cross-directorate matrix for executives.',
      attachTo: { element: '.sidebar a[href="/performance/scorecard"]', on: 'right' },
    },
    {
      id: 'act',
      title: '4. Act — Follow up',
      text: 'Coordination meetings capture decisions and action items. An action item linked to a task automatically closes the task when completed. The "Request Manager Support" button raises a blocker to your direct manager.',
      attachTo: { element: '.sidebar a[href="/jadwal"]', on: 'right' },
    },
    {
      id: 'closing',
      title: 'Done',
      text: 'You now understand the structure. This tour will be marked complete and won\'t appear again. If needed, every feature is explained again in the <a href="/playbook">Playbook</a>.',
    },
  ],
  'escalation-inbox': [
    {
      id: 'welcome',
      title: 'Clear the Path',
      text: 'Welcome to the Clear the Path feature. When a team is stuck, this system helps route support requests to the direct manager without friction.',
    },
    {
      id: 'incoming-section',
      title: 'Requests for you',
      text: 'This section shows requests from your team awaiting your disposition. Click one to open the triage panel.',
      attachTo: { element: '[data-tour="escalation-incoming"]', on: 'bottom' },
    },
    {
      id: 'mine-section',
      title: 'Your escalations',
      text: 'Here you can see the status of escalations you raised — who has committed, the due date, or whether it is still pending.',
      attachTo: { element: '[data-tour="escalation-mine"]', on: 'bottom' },
    },
  ],
  'clear-path-button': [
    {
      id: 'button-intro',
      title: 'Need manager support?',
      text: 'This button appears on active blockers. When you are stuck and need a decision from your manager, just click it — the system automatically routes it to your direct manager.',
      attachTo: { element: '[data-tour="escalation-button"]', on: 'top' },
    },
  ],
  'triage-panel': [
    {
      id: 'panel-intro',
      title: 'Quick disposition',
      text: 'Three actions are available: Commit (I will clear it), Reroute (forward to someone else), Decline (not relevant, with a reason).',
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      text: 'Power users: press C to Commit, R to Reroute, D to Decline. Faster without taking your hands off the keyboard.',
    },
  ],
  'commitment-ledger': [
    {
      id: 'ledger-intro',
      title: 'My Commitments',
      text: 'Track your consistency across 3 sources: Tasks, meeting Action Items, and Assignments. A hit rate of ≥80% for X weeks = a streak.',
      attachTo: { element: '[data-tour="commitment-ledger"]', on: 'top' },
    },
    {
      id: 'helper',
      title: 'Measuring yourself',
      text: 'The goal of this ledger is not to punish, but to help you see your consistency patterns. Your direct manager can also see this for more specific coaching.',
    },
  ],
}

export function tourExists(tourId: string): tourId is TourId {
  return tourId in TOURS
}
