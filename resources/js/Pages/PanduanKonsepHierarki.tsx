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

import { useInertiaNavigate } from '../hooks/useInertiaNavigate'
import './PanduanKonsepHierarki.css'

type Props = { onBack: () => void }

export default function PanduanKonsepHierarki({ onBack }: Props) {
  const navigate = useInertiaNavigate()

  return (
    <div className="panduan">
      <div className="panduan__inner phx-page ds-stagger" key="panduan-konsep">
        <button type="button" className="panduan__back" onClick={onBack}>
          ← Back to Help Center
        </button>

        {/* ── Hero ──────────────────────────────────────────────── */}
        <header className="phx-hero">
          <span className="phx-hero-icon" aria-hidden="true">📚</span>
          <div>
            <h1 className="phx-hero-title">Understanding the ATLAS Work Hierarchy</h1>
            <p className="phx-hero-trail">
              <span className="phx-trail-item">Program</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Workstream</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Phase</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item">Task</span>
              <span aria-hidden="true">→</span>
              <span className="phx-trail-item phx-trail-item--muted">Subtask</span>
            </p>
            <p className="phx-hero-sub">
              ATLAS uses these levels to structure work. It may sound complicated the first
              time you see it — but once you understand the differences, it all clicks into
              place. Let’s break it down one level at a time, with real examples.
            </p>
          </div>
        </header>

        {/* ── Visual tree ───────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">📊 Visual Hierarchy</h2>
          <p className="phx-sec-sub">
            Picture boxes nested inside boxes. The largest is the Program; inside it are
            Workstreams (parallel work tracks); inside a workstream are Phases (ordered
            stages); and inside a phase are Tasks (concrete work assigned to a person). A
            Subtask is a step-by-step checklist within a Task.
          </p>

          <div className="phx-tree">
            <div className="phx-node phx-node--program">
              <div className="phx-node-head">
                <span className="phx-node-icon" aria-hidden="true">🏛</span>
                <div>
                  <span className="phx-node-tag">PROGRAM</span>
                  <h3 className="phx-node-title">2026 Internal Audit</h3>
                  <p className="phx-node-meta">PIC: KADIV Audit · Period: Jan–Dec 2026</p>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM A</span>
                    <h4 className="phx-node-title">Finance Division Audit</h4>
                    <p className="phx-node-meta">PIC: KASUBDIV Finance Audit · Mar–Apr</p>
                  </div>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 1</span>
                      <h5 className="phx-node-title">Document Collection</h5>
                      <p className="phx-node-meta">1–15 March</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Collect Q1 cash flow statements <em>· Andi · 1–7 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Collect Q1 balance sheets by division <em>· Rina · 1–10 Mar</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Email treasury for January data <em>· Andi · 1–3 Mar</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 2</span>
                      <h5 className="phx-node-title">Findings Analysis</h5>
                      <p className="phx-node-meta">16–31 March</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Review cash flow variance vs budget <em>· Andi</em></li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Compile significant findings <em>· Rina</em></li>
                  </ul>
                </div>

                <div className="phx-node phx-node--phase">
                  <div className="phx-node-head">
                    <span className="phx-node-icon" aria-hidden="true">🪜</span>
                    <div>
                      <span className="phx-node-tag">PHASE 3</span>
                      <h5 className="phx-node-title">Report Drafting</h5>
                      <p className="phx-node-meta">1–15 April</p>
                    </div>
                  </div>
                  <ul className="phx-task-list">
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Draft the finance division audit report</li>
                    <li><span className="phx-task-icon" aria-hidden="true">●</span> Review the draft with the KASUBDIV</li>
                  </ul>
                </div>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM B</span>
                    <h4 className="phx-node-title">Production Division Audit</h4>
                    <p className="phx-node-meta">PIC: KASUBDIV Production Audit · Apr–May (parallel with A)</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">+ 3 Phases, 8 Tasks <span>(structure similar to Workstream A)</span></p>
              </div>

              <div className="phx-node phx-node--workstream">
                <div className="phx-node-head">
                  <span className="phx-node-icon" aria-hidden="true">📂</span>
                  <div>
                    <span className="phx-node-tag">WORKSTREAM C</span>
                    <h4 className="phx-node-title">Consolidation & Final Reporting</h4>
                    <p className="phx-node-meta">PIC: KADIV Audit · May–Jun (after A & B)</p>
                  </div>
                </div>
                <p className="phx-node-collapsed">+ 2 Phases, 5 Tasks</p>
              </div>
            </div>
          </div>

          <div className="phx-callout">
            <strong>How to read the diagram above:</strong> One Program ("2026 Internal Audit")
            has 3 parallel Workstreams. Workstream A has 3 sequential Phases (Collection →
            Analysis → Drafting). Phase 1 of Workstream A has 3 concrete Tasks assigned to
            specific people with dates.
          </div>
        </section>

        {/* ── Comparison table ──────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🆚 Quick Comparison Table</h2>
          <div className="phx-table-wrap">
            <table className="phx-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Scale</th>
                  <th>Typical duration</th>
                  <th>Typical PIC</th>
                  <th>Visible in</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Program</strong></td>
                  <td>Strategy</td>
                  <td>6–12 months</td>
                  <td>KADIV / KASUBDIV / ASISTEN</td>
                  <td>Programs menu</td>
                </tr>
                <tr>
                  <td><strong>Workstream</strong></td>
                  <td>Area / Team</td>
                  <td>2–4 months</td>
                  <td>KASUBDIV</td>
                  <td>Structure tab (in the Program detail)</td>
                </tr>
                <tr>
                  <td><strong>Phase</strong></td>
                  <td>Stage</td>
                  <td>2–4 weeks</td>
                  <td>Same as the Workstream owner</td>
                  <td>Structure tab (nested)</td>
                </tr>
                <tr>
                  <td><strong>Task</strong></td>
                  <td>Execution</td>
                  <td>Days – weeks</td>
                  <td>OFFICER / ASISTEN</td>
                  <td>Workboard (Execution)</td>
                </tr>
                <tr>
                  <td><strong>Subtask</strong></td>
                  <td>Small step</td>
                  <td>Hours</td>
                  <td>(same as the task assignee)</td>
                  <td>Only in the Task detail</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Per-level deep dive ──────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">🔍 Explained Level by Level</h2>

          {/* Program */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">1</span>
              <div>
                <h3 className="phx-level-title">Program — The Strategic Container</h3>
                <p className="phx-level-tagline">A big goal to pursue over 6–12 months</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>A Program is the largest planning unit in ATLAS.</strong> One Program
              represents a single strategic initiative with a clear goal, a major deadline
              (usually the end of the fiscal year), and a managerial-level PIC. A Program
              needs approval from a superior before it goes active (except those created by
              a KADIV).
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Example:</span>
              <span className="phx-example-body">
                <strong>Program: "2026 Internal Audit"</strong> — strategic objective:
                ensure SOP compliance and that last year’s findings have been closed out;
                deadline 31 Dec 2026; PIC KADIV Audit.
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Rule of thumb:</strong> if the work needs more than one person, more
              than one month, and has a major deliverable — it’s a Program.
            </p>
          </article>

          {/* Workstream */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">2</span>
              <div>
                <h3 className="phx-level-title">Workstream — A Parallel Work Track</h3>
                <p className="phx-level-tagline">Splits a Program into areas / teams that can run at the same time</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>A Workstream splits a Program into parallel tracks.</strong> Each
              Workstream usually owns one area (e.g. Finance Audit vs Production Audit) and
              has its own PIC (typically a KASUBDIV). A Workstream <em>does not wait</em> for
              another to finish — they run at the same time, unless there is an explicit
              dependency.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Example:</span>
              <span className="phx-example-body">
                The "2026 Internal Audit" Program has 3 Workstreams:
                <ol className="phx-inline-list">
                  <li><strong>Workstream A:</strong> Finance Division Audit (Mar–Apr)</li>
                  <li><strong>Workstream B:</strong> Production Division Audit (Apr–May, parallel)</li>
                  <li><strong>Workstream C:</strong> Consolidation & Final Reporting (May–Jun, after A & B)</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Rule of thumb:</strong> if two parts of a Program can be worked on by
              two different teams in parallel — split them into 2 Workstreams. The ideal
              count is 2–5 Workstreams per Program. More than that, and it may be time to
              consider splitting it into separate Programs.
            </p>
          </article>

          {/* Phase */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">3</span>
              <div>
                <h3 className="phx-level-title">Phase — Sequential Stages</h3>
                <p className="phx-level-tagline">What comes first and what comes next within one Workstream</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>A Phase groups Tasks by logical order.</strong> Unlike a Workstream
              (which is parallel), Phases are usually <em>sequential</em> — Phase 1 finishes
              first, then Phase 2 begins. A Phase has no separate assignee; it is purely a
              grouping container.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Example:</span>
              <span className="phx-example-body">
                Workstream A ("Finance Division Audit") has 3 sequential Phases:
                <ol className="phx-inline-list">
                  <li><strong>Phase 1:</strong> Document Collection (1–15 Mar)</li>
                  <li><strong>Phase 2:</strong> Findings Analysis (16–31 Mar, needs Phase 1 output)</li>
                  <li><strong>Phase 3:</strong> Report Drafting (1–15 Apr, needs Phase 2 output)</li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Rule of thumb:</strong> if you find yourself saying "after this, then
              that" — that’s a signal to use a Phase. Phases are also useful for monthly
              milestones (e.g. end-of-March closing = the end of Phase 1).
            </p>
          </article>

          {/* Task */}
          <article className="phx-level">
            <header className="phx-level-head">
              <span className="phx-level-num">4</span>
              <div>
                <h3 className="phx-level-title">Task — Concrete Work</h3>
                <p className="phx-level-tagline">What individual people actually do</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>A Task is the smallest unit of work that can be tracked.</strong>
              Every Task must have: a clear title, an assignee (one person), a start date and
              target completion date, and a priority. Tasks appear on the Workboard
              (Execution) and their status can move from Backlog → Ready → In Progress →
              In Review → Done.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Example:</span>
              <span className="phx-example-body">
                Phase 1 ("Document Collection") has 3 Tasks:
                <ol className="phx-inline-list">
                  <li><strong>Task:</strong> Collect Q1 cash flow statements <em>(Andi · 1–7 Mar · HIGH)</em></li>
                  <li><strong>Task:</strong> Collect Q1 balance sheets by division <em>(Rina · 1–10 Mar · MEDIUM)</em></li>
                  <li><strong>Task:</strong> Email treasury for January data <em>(Andi · 1–3 Mar · LOW)</em></li>
                </ol>
              </span>
            </div>
            <p className="phx-level-rule">
              <strong>Rule of thumb:</strong> if you can say "I will do this in X days, and
              when it’s done the output is clear" — it’s a Task. If it’s more complex, it may
              actually be a Phase (containing several Tasks).
            </p>
          </article>

          {/* Subtask */}
          <article className="phx-level phx-level--mini">
            <header className="phx-level-head">
              <span className="phx-level-num phx-level-num--mini">5</span>
              <div>
                <h3 className="phx-level-title">Subtask — A Checklist Within a Task</h3>
                <p className="phx-level-tagline">Small steps that don’t need to be tracked separately</p>
              </div>
            </header>
            <p className="phx-level-body">
              <strong>A Subtask is a step-by-step checklist within a single Task.</strong> It
              has no status, no separate assignee, and does not appear on the Workboard. It is
              only visible when you open the Task detail. Use it when a Task has a few small
              steps you want to tick off one by one.
            </p>
            <div className="phx-example">
              <span className="phx-example-label">Example:</span>
              <span className="phx-example-body">
                The Task "Email treasury for January data" might have Subtasks:
                <ol className="phx-inline-list phx-inline-list--simple">
                  <li>☐ Draft the email</li>
                  <li>☐ Send it to Hendro</li>
                  <li>☐ Confirm receipt</li>
                  <li>☐ Follow up if there’s no response within 2 days</li>
                </ol>
              </span>
            </div>
          </article>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section className="phx-section">
          <h2 className="phx-sec-title">❓ Common Points of Confusion</h2>

          <details className="phx-faq">
            <summary>When do I use a Workstream vs a Phase?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>Workstream = parallel</strong>, <strong>Phase = sequential</strong>.
                If two parts of a Program can be worked on by two different teams at the same
                time (e.g. Finance Division Audit + Production Division Audit), split them into
                2 Workstreams. If two parts must be done in sequence by the same team (e.g.
                collect documents → only then analyze), use 2 Phases within one Workstream.
              </p>
              <p className="phx-faq-tip">
                💡 Quick test: could I work on these two parts on the same day with different
                teams? If yes → Workstream. If one blocks the other → Phase.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Can a Task exist without a Phase?</summary>
            <div className="phx-faq-body">
              <p>
                Technically yes — ATLAS allows a task directly under a Workstream without a
                Phase. This is handy for quick, ad-hoc tasks that don’t need stage context.
                But for well-structured work (audits, research, scheduled projects),
                <strong> it’s best to always use a Phase</strong> — so that when someone asks
                next month "where are we?", you can answer in terms of Phases ("we’re on
                Phase 2 of 4").
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>How many Workstreams are ideal per Program?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>2–5 Workstreams</strong> is the healthy range. 1 Workstream means the
                Program doesn’t need splitting, so just go straight to Phases and Tasks. More
                than 5 means the Program is probably too big; consider splitting it into 2
                separate Programs tied together via a shared KPI or a cross-program reference.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>What’s the difference between a Phase and a Milestone?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>ATLAS does not have a separate entity called a "Milestone".</strong>
                A milestone (a moment of achievement or a major deliverable) is reflected by
                the completion of a Phase or of a specific Task. For example, "Q1 closing" is
                a milestone that also marks the end of the "Q1 Closing" Phase.
              </p>
              <p>
                If you need to mark a milestone explicitly, you can:
              </p>
              <ul className="phx-faq-list">
                <li>Create a dedicated Task titled "Milestone: …" that marks the achievement</li>
                <li>Or set the Phase’s end deadline to the milestone date</li>
              </ul>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Are Workstreams parallel or sequential?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>Parallel by default.</strong> ATLAS has no concept of "Workstream B
                waits for A". If you need a dependency between Workstreams, handle it through a
                specific Task in Workstream B that waits for Workstream A’s output (e.g. a
                blocker referencing a Workstream A Task, or simply set Workstream B’s start
                date after Workstream A’s end date).
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>Is an Assignment part of this hierarchy?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>No.</strong> An Assignment is a <em>separate track</em> outside the
                Program. An Assignment is an ad-hoc task from a superior to a team member,
                unrelated to the Program structure. It has its own status lifecycle (Ready →
                In Progress → In Review → Done), its own board in the Assignment menu, and it
                does not affect Program Health. An Assignment is recorded in the personal
                <strong> Commitment Ledger</strong> (commitment hit-rate) but not in Program
                metrics.
              </p>
            </div>
          </details>

          <details className="phx-faq">
            <summary>How do KPIs relate to this hierarchy?</summary>
            <div className="phx-faq-body">
              <p>
                <strong>KPIs are linked to a Program</strong> (not to a Workstream, Phase, or
                Task). When you link a KPI to a Program, ATLAS calculates that Program’s
                contribution toward the KPI. Tasks have no KPIs of their own — their
                contribution is reflected in the Program’s progress.
              </p>
              <p>
                To view KPIs per program: Program detail → the <strong>KPI APMS</strong> tab.
              </p>
            </div>
          </details>
        </section>

        {/* ── Mini-recap ────────────────────────────────────────── */}
        <section className="phx-section phx-recap">
          <h2 className="phx-sec-title">📝 30-Second Recap</h2>
          <ul className="phx-recap-list">
            <li><strong>Program</strong> — a 6–12 month strategic initiative with a major deliverable</li>
            <li><strong>Workstream</strong> — a parallel work track within a Program (per area/team)</li>
            <li><strong>Phase</strong> — sequential stages within a Workstream (what comes first, what comes next)</li>
            <li><strong>Task</strong> — concrete work assigned to one person with a deadline</li>
            <li><strong>Subtask</strong> — a small step checklist within a Task (not standalone)</li>
          </ul>
          <p className="phx-recap-note">
            <strong>When in doubt:</strong> ask "how long will this take?" Months = Program.
            Weeks = Phase. Days = Task. Hours = Subtask.
          </p>
        </section>

        {/* ── Link to Playbook ──────────────────────────────────── */}
        <section className="phx-playbook-link">
          <span className="panduan__playbook-link-icon" aria-hidden="true">📖</span>
          <div>
            <strong>Need the technical detail?</strong>{' '}
            <a
              href="/playbook#5-perencanaan--program--workstream"
              onClick={e => { e.preventDefault(); navigate('/playbook#5-perencanaan--program--workstream') }}
              className="panduan__playbook-link-anchor"
            >
              Open Playbook §5 — Planning: Program & Workstream
            </a>
            {' '}for the approval, editing, and health score rules.
          </div>
        </section>
      </div>
    </div>
  )
}
