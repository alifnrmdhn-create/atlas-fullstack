# ATLAS — Arsitektur Aplikasi (Snapshot 2026-04-14)

> **ATLAS** adalah *Enterprise Program Management & Collaboration Platform* internal PT Perkebunan Nusantara (PTPN) III — Direktorat Keuangan & Manajemen Risiko. Target pengguna: 50–100 user.
> Aplikasi menggabungkan **program/initiative/work-item management (ala Linear/Asana)** + **real-time collaboration (ala Slack channels & threads)** + **KPI/Risk governance** dalam satu workspace.

---

## 1. Tech Stack

### Frontend (`/frontend`)
| Layer | Tool |
|---|---|
| Framework | **React 19.2** + **TypeScript 6** |
| Build tool | **Vite 8** |
| Routing | **React Router v7** (BrowserRouter) |
| State | **Zustand 5** + React Context |
| Styling | **Plain CSS** — runtime di-bootstrap dari `frontend/src/main.tsx` yang mengimpor `styles/tokens.css`, `reset.css`, `shell.css`, `components.css`, dan stylesheet modul lain. `frontend/src/index.css` dan `App.css` saat ini **bukan** source of truth runtime. |
| Lint | ESLint 9 + `eslint-plugin-react-hooks` |

### Backend (`/backend`)
| Layer | Tool |
|---|---|
| Runtime | **Node.js** (ESM) + **tsx** untuk dev (nodemon watcher) |
| Framework | **Express 4** |
| ORM | **Prisma 6** |
| DB | **PostgreSQL** |
| Validation | **Zod 4** |
| File upload | **Multer 2** (disk storage di `backend/uploads/`) |
| Realtime | **Server-Sent Events** (custom `SseManager`) |
| Auth | Token sederhana berbasis prefix `atlas-session.<userId>` (bukan JWT) |

### URL & Port
- Vite dev: `http://localhost:5173`
- API dev: `http://localhost:3001` (default `PORT=3000`, proyek ini pakai 3001)
- CORS whitelist: localhost:5173, localhost:8888, 192.168.1.7:5173, ngrok tunnel, + `CORS_ORIGINS` env

---

## 2. Struktur Direktori

```
ptpn-kmr-app/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # ~540 LOC, 20+ model
│   │   └── seed.ts                # seeder data master + demo
│   ├── src/
│   │   ├── app.ts                 # Express bootstrap + router mount
│   │   ├── store.ts               # in-memory state store (38KB) — dipakai beberapa handler selain Prisma
│   │   ├── constants/roles.ts     # SUPERADMIN/ADMIN/BOD/KADIV/KASUBDIV/ASISTEN
│   │   ├── data/mockData.ts       # seed fallback / demo data
│   │   ├── data-access/repository.ts  # (~93KB) query helper
│   │   ├── domain/                # types + calculations (progress, health, risk score)
│   │   ├── lib/                   # auth, eventBus, http errors, permissions, prisma client, sseManager, validation
│   │   └── routes/                # 20 router module (lihat §4)
│   └── uploads/                   # file yang di-upload user
│
├── frontend/
│   ├── index.html
│   └── src/
│       ├── main.tsx               # entry — hanya meng-import index.css
│       ├── App.tsx                # BrowserRouter + AuthGate + route table
│       ├── index.css              # SATU-SATUNYA stylesheet aktif
│       ├── App.css                # DEAD CODE (tidak diimport)
│       ├── context/workspace.tsx  # WorkspaceProvider (41KB) — single source of truth di client
│       ├── layout/AppShell.tsx    # sidebar + topbar + <Outlet />
│       ├── lib/api.ts             # fetch wrapper + token storage + SSE URL helper
│       ├── components/ui.tsx      # shared UI primitives (Skeleton, Badge, etc.)
│       └── views/                 # 22 view (lihat §3)
│
└── docs/                          # spec, prompt, blueprint UX
    ├── ULTIMATE_MASTER_PROMPT_v3_FINAL.md
    ├── architecture-org-users-roles.md
    ├── atlas-architecture-prompt.md
    └── langkah-ux-blueprint.md
```

---

## 3. Frontend — Routing & Views

Semua route dibungkus `<AppShell>` kecuali auth. Index redirect ke `/dashboard`.

| Path | View | Fungsi |
|---|---|---|
| `/` | → `/dashboard` | |
| `/dashboard` | `DashboardView` (30KB) | Ringkasan KPI, program health, stat cards |
| `/roadmap` | `RoadmapView` | Timeline program/initiative |
| `/programs` | `ProgramsView` (23KB) | CRUD program + drill-down ke initiative |
| `/execution` | `WorkboardView` (24KB) | Kanban work-items (BACKLOG→DONE) + side rail |
| `/reports` | `ReportsView` | Report builder / export |
| `/goals` | `GoalsView` | Strategic goals / OKR |
| `/inbox` | `InboxView` | Notifikasi + mention |
| `/channels` | `ChannelsViewWrapper` → `ChannelsView` (85KB) | Slack-style channel + thread + DM |
| `/search` | `SearchView` | Global search (program/initiative/message) |
| `/presence` | `PresenceView` | Status online / emoji / message |
| `/profile` | `ProfileView` | Profil user, history position |
| `/settings` | `SettingsView` | Preferensi user |
| `/admin/users` | `AdminUsersView` | Master user |
| `/admin/positions` | `AdminPositionsView` | Jabatan + hierarchy |
| `/admin/orgs` | `AdminOrgsView` | Directorate + Unit |
| `/admin/roles` | `AdminRolesView` | RoleConfig (label, badge, line) |
| `*` | → `/dashboard` | fallback |

### State Management
- **`WorkspaceProvider`** (`context/workspace.tsx`) — context besar (~41KB) yang memegang auth state, user profile, programs, initiatives, work items, channels, notifications, presence.
- **Zustand** (`zustand` v5) — store terpisah untuk slice yang butuh subscription granular.
- **SSE consumer** — komponen subscribe ke `GET /api/realtime/stream?token=...` untuk live update (message, presence, notification, work-item change).

### AuthGate
- `authStatus`: `booting | signed_out | signing_in | signed_in | transitioning`
- Token disimpan di `localStorage` key `atlas.auth.token`.
- Event `atlas:auth-expired` di-dispatch saat API balas 401.

---

## 4. Backend — API Surface

Mount order di `app.ts`:

```
/api/health                    (public)
/api/auth/*                    (public)     → login/logout/forgot
/api/system/*                  (public)     → health, version
/api/realtime/stream           (public, token via query) → SSE
/api/role-configs/*            (public read, admin write)
--- authMiddleware barrier ---
/api/channels, /api/channels/:id/messages
/api/organization              → directorate, unit, position tree
/api/search
/api/presence                  (mounted as /api)
/api/comments                  (mounted as /api, polymorphic entity)
/api/programs, /api/initiatives, /api/work-items
/api/kpis, /api/blockers
/api/dashboard
/api/dm                        → direct messages
/api/notifications
/api/saved-messages
/api/users, /api/profile
/api/uploads                   (POST multipart)
/api/uploads/*                 (GET static)
```

### Auth Flow
1. `POST /api/auth/login` → return token `atlas-session.<userId>`.
2. Client menyimpan di `localStorage`, mengirim sebagai `Authorization: Bearer <token>`.
3. `authMiddleware` resolve user via prefix + lookup `store.users`; fallback `x-user-id` header untuk dev.
4. Role diperiksa per-route via helper di `lib/permissions.ts`.

### Realtime
- Transport: **Server-Sent Events** (HTTP long-lived `text/event-stream`).
- `SseManager` simpan `Map<userId, Set<Response>>`. Event di-push via `sseManager.push([userIds], event, data)` dari handler (mis. setelah posting message, update work-item status, notifikasi baru).
- Tidak ada WebSocket / Socket.io.

---

## 5. Data Model (Prisma)

### Identity & Org
- **User** — `roleType`, `directorateId`, `unitId`, `positionId`, `managerUserId`, `availableRoles` (CSV untuk role-switch), `preferences` (Json), `avatarUrl`.
- **Directorate** — 6 directorate PTPN III.
- **OrganizationalUnit** — tree (self-ref `parentId`), `unitType`, `headId`, `budget`.
- **Position** — jabatan, hierarchy via `reportsToPositionId`, `levelCode`, `roleType`, `seatOrder`.
- **PositionHistory** — log mutasi (SK, tanggal, alasan).
- **RoleConfig** — metadata role (label, badge color, line, bodLevel).

### Strategic Execution
- **Program** → `ownerId`, `budgetIdr/Spent`, `strategicAlignment`, `riskScore`, `healthStatus`, `linkedChannelId`.
- **Initiative** (child of Program) → `milestones` (Json), `healthStatus`, `riskLevel`.
- **WorkItem** (child of Initiative) → `assignedTo`, `status`, `percentComplete`, `dependsOnIds` (Json), `isBlocked`, `linkedThreadId`.
- **SubTask** (child of WorkItem) → checklist.
- **Blocker** — eskalasi dari WorkItem, punya `severity`, `rootCause`, `resolutionTime`.

### Governance
- **KpiDefinition** — `metricType`, `targetValue`, thresholds, `reviewFrequency`, `isLeadingIndicator`.
- **KpiValue** — time-series (`@@unique([kpiDefinitionId, measurementDate])`).
- **RiskIndicator** — probability × impact → riskScore, mitigation plan.

### Collaboration
- **Channel** — `type`, `topicType`, `linkedProgramId/InitiativeId`, `allowedPostTypes`, `allowThreads`, `allowReactions`, `isArchived`.
- **ChannelMember** — composite PK `(channelId, userId)`, `lastViewedAt`, `isMuted`, `isStarred`.
- **ChannelMessage** — `richContent` (Json), `attachments` (Json), `reactions` (Json), `parentMessageId` (threads self-ref), `replyCount`, `isPinned`, `searchableText`.
- **Comment** — **polymorphic** via `entityType` + `entityId`, mendukung threading (`parentCommentId`), mentions (`mentionedUserIds`, `mentionChannels`).
- **UserStatus** — presence (`status`, `emoji`, `statusMessage`, `lastActivityAt`).

### System
- **ActivityLog** — audit trail polymorphic (entity, action, old/newValues Json).
- **Notification** + **NotificationPreference**.
- **SavedSearch** — per-user saved query.

---

## 6. Roles & Permissions

Didefinisikan di `backend/src/constants/roles.ts`:

| Role | Line | BOD Level | Kemampuan Inti |
|---|---|---|---|
| `SUPERADMIN` | System | — | Full access |
| `ADMIN` | System | — | Kelola user & struktur org |
| `BOD` | Governance | — | View all programs/initiatives |
| `KADIV` | 1st Line | BOD-1 | Create/manage Program |
| `KASUBDIV` | 1st Line | BOD-2 | Create Initiative & Work Item |
| `ASISTEN` | 1st Line | BOD-3 | Mengerjakan Work Item yang ditugaskan |

Metadata (label, badge color) bisa di-override via tabel `RoleConfig`.

---

## 7. Design System (Post-Refactor 2026-04-20)

Styling aktif di-load dari `frontend/src/main.tsx`, dengan fondasi utama:

- `frontend/src/styles/tokens.css` — token design + alias kompatibilitas + dark theme variables
- `frontend/src/styles/reset.css` — reset, typography, focus treatment
- `frontend/src/styles/shell.css` — app shell/sidebar/top-level layout
- `frontend/src/styles/components.css` — reusable primitives
- stylesheet domain per layar di `frontend/src/styles/*.css` dan `frontend/src/views/*.css`

Highlight:

- **Typographic scale**: `--type-display/title/heading/subheading/body/small/xs/caption`
- **Weight tokens**: `--w-display (800)`, `--w-heading (700)`, `--w-semibold (600)`, `--w-medium (500)`
- **Surface hierarchy**: `--surface-0` (base), `--surface-1` (panel), `--surface-2` (nested panel)
- **App background**: `#EBF0F8` (richer dari sebelumnya `#EEF2F8`)
- **Workspace bg**: triple radial gradient (green + blue + gold ambient)
- **Brand hue**: `--indigo`, `--indigo-mid`, `--indigo-dim`
- **Status colors**: green `#059669`, red `#DC2626` (kontras tinggi)
- **Elevation**: `--lift-shadow` untuk hover card
- **Radius**: `--radius-md: 12px`
- **Transition**: 160ms
- **Theme bootstrap**: preferensi `atlas.theme` dipulihkan langsung dari `frontend/index.html` sebelum React mount, lalu disinkronkan lagi di `frontend/src/lib/theme.ts`
- **Theme preference model**: `light | dark | system`, dengan `data-theme` selalu di-resolve ke `light` atau `dark` untuk menjaga kompatibilitas selector CSS lama
- **Micro-interactions**: `view-enter`, `fade-up`, `fade-in`, `scale-in`, `.work-card--dragging { rotate: 2deg }`

**Design benchmark**: Trello, Slack, Linear (modern, vibrant, profesional).

---

## 8. Conventions & Gotchas

- ✅ Jangan anggap `frontend/src/index.css` sebagai source of truth. Styling aktif tersebar di `frontend/src/styles/` dan stylesheet view khusus yang diimpor lewat `frontend/src/main.tsx`.
- ✅ Jika menambah atau mengubah dark mode, prioritaskan token di `frontend/src/styles/tokens.css` dan util di `frontend/src/lib/theme.ts` sebelum membuat override baru per-komponen.
- ✅ Backend pakai **dual data source**: Prisma (persisten) + `store.ts` in-memory (beberapa handler & auth lookup). Kedua-duanya harus di-sync saat ada perubahan schema.
- ✅ Realtime via **SSE**, bukan WebSocket.
- ✅ Token auth **bukan JWT** — string prefix sederhana. Cocok untuk intranet, bukan production public.
- ✅ File upload disimpan di filesystem (`backend/uploads/`), di-serve via `express.static`. **POST route harus di-mount sebelum static** supaya Multer menangani duluan.
- ✅ Semua polymorphic relation (Comment, ActivityLog) pakai `entityType` + `entityId` — tidak ada FK, validasi di layer service.
- ✅ `dependsOnIds`, `milestones`, `reactions`, `attachments`, `richContent` disimpan sebagai `Json` — bukan relational.
- ⚠️ `ChannelsView.tsx` sangat besar (~85KB) — kandidat utama untuk refactor/split.
- ⚠️ `context/workspace.tsx` (~41KB) + `store.ts` (~38KB) + `repository.ts` (~93KB) — berpotensi jadi bottleneck maintainability.

---

## 9. Scripts

### Frontend
```bash
npm run dev       # vite dev server :5173
npm run build     # tsc -b && vite build
npm run lint
npm run preview
```

### Backend
```bash
npm run dev               # nodemon + tsx watcher
npm run build             # tsc
npm start                 # node dist/app.js
npm run prisma:generate
npm run prisma:push
npm run prisma:migrate
npm run prisma:seed
```

---

## 10. Ringkasan Satu Baris

> ATLAS = **React 19 SPA + Express/Prisma/Postgres backend + SSE realtime**, dengan domain 3-tier (**Program → Initiative → Work Item**), governance (**KPI + Risk + Blocker**), kolaborasi (**Channel + Thread + DM + polymorphic Comment**), dan struktur org PTPN III (**Directorate → Unit → Position → User**), di-skin dengan design system token-based yang di-benchmark ke Trello/Slack/Linear.
