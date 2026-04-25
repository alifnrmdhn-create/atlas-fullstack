# ATLAS UX Blueprint

## Product Positioning

ATLAS is the project management and collaboration platform for the Directorate of Finance and Risk Management at PTPN III (Persero).

The target experience combines:

- Monday.com for visual planning and portfolio scanning
- Jira for issue structure, execution flow, and detail density
- Slack for communication, threads, and collaboration context

The goal is not to imitate any one tool directly. The goal is to create a unified work OS that feels modern, operational, and calm under daily use.

## Target Shell

The shell should follow a stable 3-part mental model:

1. Global navigation rail
   Use for switching between major work modes, not for deep actions.
2. Main workspace
   The active view owns the page and should carry the primary cognitive load.
3. Contextual status and command layer
   Persistent search, sync state, workspace identity, and quick actions.

This means the shell should feel closer to a product operating system than a generic dashboard.

## Navigation Model

Primary views stay:

- Dashboard
- Channels
- Programs
- Execution
- Search
- Presence

Rules:

- Each primary view must represent one clear mental model.
- Primary navigation should not become a second dashboard.
- Metrics in navigation should be compact and glanceable, never verbose.

## View Intent

### Dashboard

Purpose:

- executive scanning
- steering focus
- cross-program pressure visibility

Structure:

- hero summary
- command band
- portfolio health grid
- right-rail governance and leading indicators
- recent activity and collaboration pulse

Avoid:

- overusing identical cards
- large empty white space
- treating dashboard as a report rather than a command surface

### Channels

Purpose:

- team coordination
- threaded updates
- decision capture

Structure:

- left: channel list, search, filters
- center: message stream
- right: thread detail or member context

This should feel closest to Slack.

### Programs

Purpose:

- portfolio management
- initiative tracking
- steering context

Structure:

- portfolio summary band
- switchable work modes in future: overview, table, timeline, governance
- detail rail for selected program

This should feel closest to Monday with stronger governance context.

### Execution

Purpose:

- work item flow
- blocker management
- rapid triage

Structure:

- execution summary band
- filter/action bar
- board lanes
- issue detail panel

This should feel closest to Jira with a cleaner visual layer.

### Search

Purpose:

- workspace retrieval
- knowledge entry point

Structure:

- persistent query bar
- result groups
- saved views
- operator help

### Presence

Purpose:

- coordination awareness
- human availability

Structure:

- team overview
- people list
- update-my-status card
- notification stream

## Visual Direction

ATLAS should feel:

- bright, clean, and confident
- modern enterprise, not legacy internal app
- operational, not decorative
- friendly enough for daily use, but not playful or consumerish

### Typography

- Primary UI font: Plus Jakarta Sans
- Technical mono: IBM Plex Mono

Typography should do these jobs:

- strong hierarchy in headings
- compact clarity in controls
- readable scanning in dense lists

### Surface System

Use 3 surface levels:

- shell surface
- primary work panel
- nested card / row surface

Each level should be visually distinct through:

- border contrast
- elevation
- background tint
- spacing rhythm

Avoid making all cards look identical.

### Color Behavior

- Base UI: cool white / cloud blue neutrals
- Accent: warm orange for energy
- Support accent: teal for live/healthy/active states
- Blue should be used for structure and navigation, not as a random accent everywhere

### Motion

Motion should be restrained and useful:

- panel enter
- subtle hover lift
- live pulse
- staggered list reveal where helpful

No heavy animation loops or decorative motion.

## Interaction Rules

- Actions should be near the object they affect.
- Inline controls should win over modal-heavy flows.
- Selection should create context, not page confusion.
- Right rails should help users stay oriented, not distract them.

## Refactor Order

1. Shell and navigation
2. Dashboard desktop layout
3. Channels split-view polish
4. Programs portfolio workspace
5. Execution issue-centric workspace
6. Global search and quick command layer
7. Motion and interaction polish

## Current Decisions

- The current app shell will be refactored, not preserved as a final pattern.
- Sidebar remains, but becomes more product-like.
- Topbar becomes the command/status layer.
- Channels stays split-view and will be the Slack reference area.
- Programs and Execution will diverge structurally instead of sharing the same visual logic.
