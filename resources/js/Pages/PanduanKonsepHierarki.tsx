/* PanduanKonsepHierarki — materi onboarding khusus untuk memahami 4 level
 * hierarki kerja ATLAS (Program → Workstream → Phase → Task → Subtask).
 *
 * Diakses dari PanduanView dengan klik banner "Pertama kali pakai ATLAS?".
 * Tidak punya route sendiri — dirender via state internal PanduanView.
 *
 * Struktur konten (per kesepakatan 25 Mei 2026):
 *   1. Hero + 1-liner "kenapa hierarki"
 *   2. Visual tree (nested boxes — Pattern A flat dengan indent + border-left)
 *   3. Tabel perbandingan 4 level
 *   4. Penjelasan per-level dengan contoh berkelanjutan
 *   5. Contoh lengkap end-to-end (Audit Internal 2026)
 *   6. FAQ kebingungan tersering
 *   7. Link ke Playbook §5 untuk detail teknis
 */

import { useTranslation } from 'react-i18next'
import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import './PanduanKonsepHierarki.css'

type Props = { onBack: () => void }

export default function PanduanKonsepHierarki({ onBack }: Props) {
  const { t } = useTranslation()
  const navigate = useInertiaNavigate()

  return (
    <div className="panduan">
      <div className="panduan__inner phx-page ds-stagger" key="panduan-konsep">
        <button type="button" className="panduan__back" onClick={onBack}>
          ← {t('Back to Help Center')}
        </button>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <header className="phx-hero">
          <span className="phx-hero-icon" aria-hidden="true">📚</span>
          <div>
            <h1 className="phx-hero-title">{t('Understanding the ATLAS Work Hierarchy')}</h1>
            <p className="phx-hero-trail">
              <span className="phx-trail-item">{t('Program')}</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">{t('Workstream')}</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">{t('Phase')}</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">{t('Task')}</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item phx-trail-item--muted">{t('Subtask')}</span>
            </p>
            <p className="phx-hero-sub">
              {t('ATLAS uses these levels to structure work. It may sound complicated the first time you see it — but once you understand the differences, it all clicks into place. Let’s break it down one level at a time, with real examples.')}
            </p>
          </div>
        </header>

        {/* ── Visual tree ───────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">📊 {t('Visual Hierarchy')}</h2>
          <p className="phx-sec-sub">
            {t('Picture boxes nested inside boxes. The largest is the Program; inside it are Workstreams (parallel work tracks); inside a workstream are Phases (ordered stages); and inside a phase are Tasks (concrete work assigned to a person). A Subtask is a step-by-step checklist within a Task.')}
          </p>

          <div className="phx-tree">
            <div className="phx-node phx-node--program">
              <div className="phx-node-head">
                <span className="phx-node-icon" aria-hidden="true">🏛</span>
                <div>
                  <span className="phx-node-tag">{t('PROGRAM')}</span>
                  <h3 className="phx-node-title">{t('2026 Internal Audit')}</h3>
                  <p className="phx-node-meta">{t('PIC: KADIV Audit · Period: Jan–Dec 2026')}</p>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">{t('WORKSTREAM A')}</span>
                    <h4 className="phx-node-title">{t('Finance Division Audit')}</h4>
                    <p className="phx-node-meta">{t('Finance area · Mar–Apr')}</p>
                  </div>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">{t('PHASE 1')}</span>
                      <h5 className="phx-node-title">{t('Document Collection')}</h5>
                      <p className="phx-node-meta">{t('1–15 March')}</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Collect Q1 cash flow statements')} <em>· Andi · 1–7 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Collect Q1 balance sheets by division')} <em>· Rina · 1–10 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Email treasury for January data')} <em>· Andi · 1–3 Mar</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">{t('PHASE 2')}</span>
                      <h5 className="phx-node-title">{t('Findings Analysis')}</h5>
                      <p className="phx-node-meta">{t('16–31 March')}</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Review cash flow variance vs budget')} <em>· Andi</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Compile significant findings')} <em>· Rina</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">{t('PHASE 3')}</span>
                      <h5 className="phx-node-title">{t('Report Drafting')}</h5>
                      <p className="phx-node-meta">{t('1–15 April')}</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Draft the finance division audit report')}</li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> {t('Review the draft with the KASUBDIV')}</li>
                  </ul>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">{t('WORKSTREAM B')}</span>
                    <h4 className="phx-node-title">{t('Production Division Audit')}</h4>
                    <p className="phx-node-meta">{t('Production area · Apr–May (parallel with A)')}</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">{t('+ 3 Phases, 8 Tasks')} <span>{t('(structure similar to Workstream A)')}</span></p>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">{t('WORKSTREAM C')}</span>
                    <h4 className="phx-node-title">{t('Consolidation & Final Reporting')}</h4>
                    <p className="phx-node-meta">{t('Consolidation · May–Jun (after A & B)')}</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">{t('+ 2 Phases, 5 Tasks')}</p>
              </div>
            </div>
          </div>

          <div className="phx-callout">
            <strong>{t('How to read the diagram above:')}</strong> {t('One Program ("2026 Internal Audit") has 3 parallel Workstreams. Workstream A has 3 sequential Phases (Collection → Analysis → Drafting). Phase 1 of Workstream A has 3 concrete Tasks assigned to specific people with dates.')}
          </div>
        </section>

        {/* ── Comparison table ──────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🆚 {t('Quick Comparison Table')}</h2>
          <div className="phx-table-wrap">
            <table className="phx-table">
              <thead>
                <tr>
                  <th>{t('Level')}</th>
                  <th>{t('Scale')}</th>
                  <th>{t('Typical duration')}</th>
                  <th>{t('Typical PIC')}</th>
                  <th>{t('Visible in')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>{t('Program')}</strong></td>
                  <td>{t('Strategy')}</td>
                  <td>{t('6–12 months')}</td>
                  <td>KADIV / KASUBDIV</td>
                  <td>{t('Programs menu')}</td>
                </tr>
                <tr>
                  <td><strong>{t('Workstream')}</strong></td>
                  <td>{t('Area / Team')}</td>
                  <td>{t('2–4 months')}</td>
                  <td>{t('Program PIC (no separate PIC)')}</td>
                  <td>{t('Structure tab (in the Program detail)')}</td>
                </tr>
                <tr>
                  <td><strong>{t('Phase')}</strong></td>
                  <td>{t('Stage')}</td>
                  <td>{t('2–4 weeks')}</td>
                  <td>{t('Program PIC (no separate PIC)')}</td>
                  <td>{t('Structure tab (nested)')}</td>
                </tr>
                <tr>
                  <td><strong>{t('Task')}</strong></td>
                  <td>{t('Execution')}</td>
                  <td>{t('Days – weeks')}</td>
                  <td>OFFICER / ASISTEN</td>
                  <td>{t('Workboard (Execution)')}</td>
                </tr>
                <tr>
                  <td><strong>{t('Subtask')}</strong></td>
                  <td>{t('Small step')}</td>
                  <td>{t('Hours')}</td>
                  <td>{t('(same as the task assignee)')}</td>
                  <td>{t('Only in the Task detail')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Per-level deep dive ──────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🔍 {t('Explained Level by Level')}</h2>

          {/* Program */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">1</span>
              <div>
                <h3 className="phx-level-title">{t('Program — The Strategic Container')}</h3>
                <p className="phx-level-tagline">{t('A big goal to pursue over 6–12 months')}</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>{t('A Program is the largest planning unit in ATLAS.')}</strong> {t('One Program represents a single strategic initiative with a clear goal, a major deadline (usually the end of the fiscal year), and a managerial-level PIC. A Program needs approval from a superior before it goes active (except those created by a KADIV).')}
            </p>
            <div className="phx-example">
              <span className="phx-example-label">{t('Example:')}</span>
              <span className="phx-example-body">
                <strong>{t('Program: "2026 Internal Audit"')}</strong> — {t('strategic objective: ensure SOP compliance and that last year’s findings have been closed out; deadline 31 Dec 2026; PIC KADIV Audit.')}
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>{t('Rule of thumb:')}</strong> {t('if the work needs more than one person, more than one month, and has a major deliverable — it’s a Program.')}
            </p>
          </article>

          {/* Workstream */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">2</span>
              <div>
                <h3 className="phx-level-title">{t('Workstream — A Parallel Work Track')}</h3>
                <p className="phx-level-tagline">{t('Splits a Program into areas / teams that can run at the same time')}</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>{t('A Workstream splits a Program into parallel tracks.')}</strong> {t('Each Workstream usually covers one area (e.g. Finance Audit vs Production Audit). It no longer carries its own owner/PIC — accountability stays with the program PIC (KADIV/KASUBDIV) and each task’s assignee. A Workstream')} <em>{t('does not wait')}</em> {t('for another to finish — they run at the same time, unless there is an explicit dependency.')}
            </p>
            <div className="phx-example">
              <span className="phx-example-label">{t('Example:')}</span>
              <span className="phx-example-body">
                {t('The "2026 Internal Audit" Program has 3 Workstreams:')}
                <ol className="phx-inline-list">
                  <li><strong>{t('Workstream A:')}</strong> {t('Finance Division Audit (Mar–Apr)')}</li>
                  <li><strong>{t('Workstream B:')}</strong> {t('Production Division Audit (Apr–May, parallel)')}</li>
                  <li><strong>{t('Workstream C:')}</strong> {t('Consolidation & Final Reporting (May–Jun, after A & B)')}</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>{t('Rule of thumb:')}</strong> {t('if two parts of a Program can be worked on by two different teams in parallel — split them into 2 Workstreams. The ideal count is 2–5 Workstreams per Program. More than that, and it may be time to consider splitting it into separate Programs.')}
            </p>
          </article>

          {/* Phase */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">3</span>
              <div>
                <h3 className="phx-level-title">{t('Phase — Sequential Stages')}</h3>
                <p className="phx-level-tagline">{t('What comes first and what comes next within one Workstream')}</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>{t('A Phase groups Tasks by logical order.')}</strong> {t('Unlike a Workstream (which is parallel), Phases are usually')} <em>{t('sequential')}</em> — {t('Phase 1 finishes first, then Phase 2 begins. A Phase has no separate assignee; it is purely a grouping container.')}
            </p>
            <div className="phx-example">
              <span className="phx-example-label">{t('Example:')}</span>
              <span className="phx-example-body">
                {t('Workstream A ("Finance Division Audit") has 3 sequential Phases:')}
                <ol className="phx-inline-list">
                  <li><strong>{t('Phase 1:')}</strong> {t('Document Collection (1–15 Mar)')}</li>
                  <li><strong>{t('Phase 2:')}</strong> {t('Findings Analysis (16–31 Mar, needs Phase 1 output)')}</li>
                  <li><strong>{t('Phase 3:')}</strong> {t('Report Drafting (1–15 Apr, needs Phase 2 output)')}</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>{t('Rule of thumb:')}</strong> {t('if you find yourself saying "after this, then that" — that’s a signal to use a Phase. Phases are also useful for monthly milestones (e.g. end-of-March closing = the end of Phase 1).')}
            </p>
          </article>

          {/* Task */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">4</span>
              <div>
                <h3 className="phx-level-title">{t('Task — Concrete Work')}</h3>
                <p className="phx-level-tagline">{t('What individual people actually do')}</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>{t('A Task is the smallest unit of work that can be tracked.')}</strong>{' '}
              {t('Every Task must have: a clear title, an assignee (one person), a start date and target completion date, and a priority. Tasks appear on the Workboard (Execution) and their status can move from Backlog → Ready → In Progress → In Review → Done.')}
            </p>
            <div className="phx-example">
              <span className="phx-example-label">{t('Example:')}</span>
              <span className="phx-example-body">
                {t('Phase 1 ("Document Collection") has 3 Tasks:')}
                <ol className="phx-inline-list">
                  <li><strong>{t('Task:')}</strong> {t('Collect Q1 cash flow statements')} <em>(Andi · 1–7 Mar · HIGH)</em></li>
                  <li><strong>{t('Task:')}</strong> {t('Collect Q1 balance sheets by division')} <em>(Rina · 1–10 Mar · MEDIUM)</em></li>
                  <li><strong>{t('Task:')}</strong> {t('Email treasury for January data')} <em>(Andi · 1–3 Mar · LOW)</em></li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>{t('Rule of thumb:')}</strong> {t('if you can say "I will do this in X days, and when it’s done the output is clear" — it’s a Task. If it’s more complex, it may actually be a Phase (containing several Tasks).')}
            </p>
          </article>

          {/* Subtask */}
          <article className="phx-level phx-level--mini">
            <header className="phx-level-head">
              <span className="phx-level-num phx-level-num--mini">5</span>
              <div>
                <h3 className="phx-level-title">{t('Subtask — A Checklist Within a Task')}</h3>
                <p className="phx-level-tagline">{t('Small steps that don’t need to be tracked separately')}</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>{t('A Subtask is a step-by-step checklist within a single Task.')}</strong> {t('It has no status, no separate assignee, and does not appear on the Workboard. It is only visible when you open the Task detail. Use it when a Task has a few small steps you want to tick off one by one.')}
            </p>
            <div className="phx-example">
              <span className="phx-example-label">{t('Example:')}</span>
              <span className="phx-example-body">
                {t('The Task "Email treasury for January data" might have Subtasks:')}
                <ol className="phx-inline-list phx-inline-list--simple">
                  <li>☐ {t('Draft the email')}</li>
                  <li>☐ {t('Send it to Hendro')}</li>
                  <li>☐ {t('Confirm receipt')}</li>
                  <li>☐ {t('Follow up if there’s no response within 2 days')}</li>
                </ol>
              </span>
            </div>
          </article>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">❓ {t('Common Points of Confusion')}</h2>

          <details className="phx-faq">
            <summary>{t('When do I use a Workstream vs a Phase?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('Workstream = parallel')}</strong>, <strong>{t('Phase = sequential')}</strong>.
                {' '}{t('If two parts of a Program can be worked on by two different teams at the same time (e.g. Finance Division Audit + Production Division Audit), split them into 2 Workstreams. If two parts must be done in sequence by the same team (e.g. collect documents → only then analyze), use 2 Phases within one Workstream.')}
              </p>
              <p className="phx-faq-tip">
                💡 {t('Quick test: could I work on these two parts on the same day with different teams? If yes → Workstream. If one blocks the other → Phase.')}
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('Can a Task exist without a Phase?')}</summary>
            <div className="phx-faq-body">
              <p>
                {t('Technically yes — ATLAS allows a task directly under a Workstream without a Phase. This is handy for quick, ad-hoc tasks that don’t need stage context. But for well-structured work (audits, research, scheduled projects),')}
                <strong> {t('it’s best to always use a Phase')}</strong> — {t('so that when someone asks next month "where are we?", you can answer in terms of Phases ("we’re on Phase 2 of 4").')}
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('How many Workstreams are ideal per Program?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('2–5 Workstreams')}</strong> {t('is the healthy range. 1 Workstream means the Program doesn’t need splitting, so just go straight to Phases and Tasks. More than 5 means the Program is probably too big; consider splitting it into 2 separate Programs tied together via a shared KPI or a cross-program reference.')}
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('What’s the difference between a Phase and a Milestone?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('ATLAS does not have a separate entity called a "Milestone".')}</strong>
                {' '}{t('A milestone (a moment of achievement or a major deliverable) is reflected by the completion of a Phase or of a specific Task. For example, "Q1 closing" is a milestone that also marks the end of the "Q1 Closing" Phase.')}
              </p>
              <p>
                {t('If you need to mark a milestone explicitly, you can:')}
              </p>
              <ul className="phx-faq-list">
                <li>{t('Create a dedicated Task titled "Milestone: …" that marks the achievement')}</li>
                <li>{t('Or set the Phase’s end deadline to the milestone date')}</li>
              </ul>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('Are Workstreams parallel or sequential?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('Parallel by default.')}</strong> {t('ATLAS has no concept of "Workstream B waits for A". If you need a dependency between Workstreams, handle it through a specific Task in Workstream B that waits for Workstream A’s output (e.g. a blocker referencing a Workstream A Task, or simply set Workstream B’s start date after Workstream A’s end date).')}
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('Is an Assignment part of this hierarchy?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('No.')}</strong> {t('An Assignment is a')} <em>{t('separate track')}</em> {t('outside the Program. An Assignment is an ad-hoc task from a superior to a team member, unrelated to the Program structure. It has its own status lifecycle (Ready → In Progress → In Review → Done), its own board in the Assignment menu, and it does not affect Program Health. An Assignment is recorded in the personal')}
                <strong> {t('Commitment Ledger')}</strong> {t('(commitment hit-rate) but not in Program metrics.')}
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>{t('How do KPIs relate to this hierarchy?')}</summary>
            <div className="phx-faq-body">
              <p>
                <strong>{t('KPIs are linked to a Program')}</strong> {t('(not to a Workstream, Phase, or Task). When you link a KPI to a Program, ATLAS calculates that Program’s contribution toward the KPI. Tasks have no KPIs of their own — their contribution is reflected in the Program’s progress.')}
              </p>
              <p>
                {t('To view KPIs per program: Program detail → the')} <strong>KPI APMS</strong> {t('tab.')}
              </p>
            </div>
          </details>
        </section>

        {/* ── Mini-recap ────────────────────────────────────────── */}
        <section className="phx-section phx-recap">
          <h2 className="phx-sec-title">📝 {t('30-Second Recap')}</h2>
          <ul className="phx-recap-list">
            <li><strong>{t('Program')}</strong> — {t('a 6–12 month strategic initiative with a major deliverable')}</li>
            <li><strong>{t('Workstream')}</strong> — {t('a parallel work track within a Program (per area/team)')}</li>
            <li><strong>{t('Phase')}</strong> — {t('sequential stages within a Workstream (what comes first, what comes next)')}</li>
            <li><strong>{t('Task')}</strong> — {t('concrete work assigned to one person with a deadline')}</li>
            <li><strong>{t('Subtask')}</strong> — {t('a small step checklist within a Task (not standalone)')}</li>
          </ul>
          <p className="phx-recap-note">
            <strong>{t('When in doubt:')}</strong> {t('ask "how long will this take?" Months = Program. Weeks = Phase. Days = Task. Hours = Subtask.')}
          </p>
        </section>

        {/* ── Link to Playbook ──────────────────────────────────── */}
        <section className="phx-playbook-link">
          <span className="panduan__playbook-link-icon" aria-hidden="true">📖</span>
          <div>
            <strong>{t('Need the technical detail?')}</strong>{' '}
            <a
              href="/playbook#5-perencanaan--program--workstream"
              onClick={e => { e.preventDefault(); navigate('/playbook#5-perencanaan--program--workstream') }}
              className="panduan__playbook-link-anchor"
            >
              {t('Open Playbook §5 — Planning: Program & Workstream')}
            </a>
            {' '}{t('for the approval, editing, and health score rules.')}
          </div>
        </section>
      </div>
    </div>
  )
}
