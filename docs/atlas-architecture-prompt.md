# Prompt Penjelasan Arsitektur Lengkap Aplikasi ATLAS

Gunakan prompt berikut jika kamu ingin AI lain menjelaskan arsitektur aplikasi ATLAS secara detail, akurat, dan berbasis struktur proyek yang ada.

```md
Anda adalah software architect senior yang sedang melakukan reverse engineering terhadap aplikasi internal bernama ATLAS.

Tugas Anda adalah menulis penjelasan yang sangat detail, sistematis, dan mudah dipahami tentang arsitektur lengkap aplikasi ini berdasarkan konteks proyek berikut. Jangan memberi jawaban generik. Anggap informasi di bawah ini adalah hasil inspeksi langsung terhadap source code dan struktur folder proyek.

## Tujuan Jawaban

Buat penjelasan arsitektur lengkap aplikasi ATLAS yang mencakup:
- gambaran besar sistem
- pembagian tanggung jawab setiap layer
- struktur folder dan peran file-file penting
- alur data end-to-end dari frontend ke backend hingga persistence
- domain model dan relasi entitas bisnis
- pola state management dan sinkronisasi data di frontend
- desain API dan grouping endpoint
- mekanisme autentikasi, otorisasi, dan sesi
- mekanisme realtime
- strategi persistence dan fallback
- insight tentang kekuatan, tradeoff, dan potensi technical debt

Gunakan bahasa Indonesia yang jelas dan profesional.

## Konteks Proyek ATLAS

ATLAS adalah aplikasi workspace internal untuk koordinasi program, eksekusi inisiatif, kolaborasi tim, monitoring KPI, blocker tracking, presence, notification, pencarian pengetahuan, dan dashboard governance. Konsep produknya menggabungkan karakteristik:
- Slack-like collaboration
- Jira/Monday-like execution tracking
- dashboard strategis dan governance untuk konteks PTPN/KMR

## Struktur Repo

Repository dibagi menjadi beberapa area utama:

- `frontend/`
  Aplikasi UI berbasis React + TypeScript + Vite.
- `backend/`
  REST API berbasis Express + TypeScript + Prisma + PostgreSQL.
- `docs/`
  Dokumen setup, blueprint, dan prompt proyek.

## Stack Teknis

### Frontend
- React 19
- TypeScript
- Vite 8
- Native fetch wrapper internal, tanpa state manager eksternal seperti Redux

### Backend
- Node.js
- Express 4
- TypeScript
- Zod untuk validasi request
- Prisma ORM
- PostgreSQL

## Entry Point dan Konfigurasi

### Frontend
- File entry utama: `frontend/src/main.tsx`
- Shell aplikasi utama: `frontend/src/App.tsx`
- API base URL diambil dari `frontend/.env`
  - `VITE_API_URL=http://localhost:3001/api`
- Vite dev server:
  - host: `0.0.0.0`
  - port: `5173`

### Backend
- Entry point: `backend/src/app.ts`
- Port default backend: `3001`
- Backend menggunakan `dotenv`
- Ada konfigurasi `CORS` untuk localhost, IP LAN tertentu, dan host `ngrok`

## Arsitektur Tingkat Tinggi

Secara konseptual, arsitektur ATLAS terbagi menjadi 3 lapisan besar:

1. Presentation Layer
   Frontend React yang menangani login, dashboard, channels, program workspace, workboard, search, presence, notifikasi, dan interaksi user.

2. Application/API Layer
   Backend Express yang mengekspos endpoint REST per domain, memvalidasi payload, memproses request, dan mengorkestrasi akses data melalui repository.

3. Data/Persistence Layer
   Prisma + PostgreSQL sebagai persistence utama, dengan fallback ke seeded in-memory store jika database tidak tersedia.

## Struktur Frontend

Frontend berpusat di `frontend/src/App.tsx`, yang berfungsi sebagai orchestration shell utama. Tidak ada router library terpisah; perpindahan tampilan dikelola oleh state lokal dengan `activeView`.

View utama yang terlihat dari kode:
- `dashboard`
- `channels`
- `programs`
- `workboard`
- `search`
- `presence`

File penting frontend:
- `frontend/src/App.tsx`
  Pusat state global aplikasi, orchestration fetch data, auth bootstrap, realtime subscription, auto-refresh, dan rendering workspace.
- `frontend/src/lib/api.ts`
  Wrapper `fetch` untuk seluruh request API.
  Tanggung jawabnya:
  - menyusun URL berdasarkan `VITE_API_URL`
  - menyisipkan header `Authorization: Bearer <token>`
  - melempar `ApiRequestError`
  - memancarkan event auth-expired saat menerima 401
  - menyediakan helper `realtime.streamUrl()` untuk SSE
- `frontend/src/views/AuthEntryView.tsx`
  UI login.
- `frontend/src/views/ChannelsView.tsx`
  UI workspace channels, daftar channel, message stream, filter, dan thread selection.
- `frontend/src/components/ui.tsx`
  Kumpulan komponen UI reusable.
- `frontend/src/types.ts`
  Kontrak tipe data frontend terhadap payload API.

## Pola State Management Frontend

Frontend tidak memakai Redux, Zustand, atau React Query. Sebagai gantinya:
- state utama disimpan langsung di `App.tsx` dengan banyak `useState`
- sinkronisasi lifecycle dilakukan dengan `useEffect`
- beberapa event handler asinkron menggunakan `useEffectEvent`
- view detail dimuat berdasarkan selection state seperti:
  - `selectedChannelId`
  - `selectedThreadId`
  - `selectedProgramId`
  - `selectedInitiativeId`
  - `selectedWorkItemId`

State penting yang dikelola di `App.tsx` meliputi:
- auth state
- current user
- dashboard payload
- list channels
- list programs
- grouped work items
- kpis
- blockers
- presence users
- notifications
- saved searches
- system status
- search results
- detail channel/thread
- detail program/initiative/work item
- draft composer dan status loading/saving

## Pola Pengambilan Data Frontend

Saat user berhasil login:
- frontend memanggil `loadOverview('initial')`
- beberapa endpoint dipanggil paralel memakai `Promise.allSettled`

Endpoint overview yang diambil bersamaan:
- `/dashboard`
- `/channels`
- `/programs`
- `/work-items`
- `/kpis`
- `/blockers`
- `/users/presence`
- `/notifications?read=all`
- `/search/saved`
- `/system/status`

Setelah overview:
- detail channel dimuat saat `selectedChannelId` berubah
- detail thread dimuat saat `selectedThreadId` berubah
- detail program dimuat saat `selectedProgramId` berubah
- detail initiative dimuat saat `selectedInitiativeId` berubah
- detail work item dimuat saat `selectedWorkItemId` berubah

Ada juga refresh periodik:
- overview refresh tiap 5 menit
- active view detail refresh tiap 20 detik

## Mekanisme Realtime Frontend

Frontend membuka koneksi `EventSource` ke:
- `/api/realtime/stream?token=<session-token>`

Peran realtime:
- update ringkas channel summary
- update presence
- update notifications
- memicu refresh channel detail jika snapshot menunjukkan perubahan unread count atau last message

Frontend tetap mempertahankan polling sebagai jalur cadangan walaupun SSE aktif.

## Autentikasi Frontend

Autentikasi di frontend bersifat token-based sederhana:
- token disimpan di `localStorage`
- key: `atlas.auth.token`
- token dibaca oleh `sessionStorage.getToken()`
- token dikirim pada setiap request via bearer token

Bootstrap auth:
- frontend lebih dulu memanggil `/auth/options`
- jika ada token tersimpan, frontend memanggil `/auth/session`
- jika sesi valid, user langsung masuk ke workspace
- jika tidak valid, user dikembalikan ke screen login

## Struktur Backend

Backend dimulai dari `backend/src/app.ts`.

Urutan penting middleware dan routing:
- inisialisasi dotenv
- konfigurasi CORS
- `express.json()`
- request logging middleware
- `GET /api/health`
- route publik:
  - `/api/auth`
  - `/api/system`
  - `/api/realtime`
- setelah itu dipasang `authMiddleware` pada `/api`
- route terproteksi berikutnya berjalan setelah auth

Route domain utama yang terdaftar:
- `/api/channels`
- `/api/channels/:channelId/messages`
- `/api/organization`
- `/api/search`
- presence routes di `/api`
- comments routes di `/api`
- `/api/programs`
- `/api/initiatives`
- `/api/work-items`
- `/api/kpis`
- `/api/blockers`
- `/api/dashboard`
- `/api/notifications`

## Lapisan Backend

### 1. Routes Layer
File-file di `backend/src/routes/*.ts` mendefinisikan endpoint per domain dan memanggil repository.

Contoh domain route:
- `auth.ts`
- `channels.ts`
- `channel-messages.ts`
- `comments.ts`
- `dashboard.ts`
- `programs.ts`
- `initiatives.ts`
- `workitems.ts`
- `kpis.ts`
- `blockers.ts`
- `presence.ts`
- `notifications.ts`
- `search.ts`
- `organization.ts`
- `system.ts`
- `realtime.ts`

### 2. Validation Layer
`backend/src/lib/validation.ts` berisi schema Zod untuk:
- ID dan pagination
- channel
- messages
- reactions
- search
- saved search
- presence
- comments
- program creation/update
- work item status/progress
- sub task
- KPI value
- blocker

### 3. HTTP Utility Layer
`backend/src/lib/http.ts` menyediakan:
- `ApiError`
- `badRequest`
- `notFound`
- `asyncHandler`
- `sendSuccess`
- `errorMiddleware`

### 4. Auth Utility Layer
`backend/src/lib/auth.ts` menyediakan:
- parsing bearer token
- parsing token dari query string untuk SSE
- `createSessionToken(userId)` dengan format `atlas-session.<userId>`
- `resolveSessionUser()`
- `authMiddleware`

### 5. Repository Layer
`backend/src/data-access/repository.ts` adalah pusat orkestrasi akses data aplikasi.

Repository ini:
- menjadi facade utama antara routes dan data layer
- memutuskan apakah request dilayani dari database atau fallback memory store
- melakukan mapping tipe Prisma ke payload API
- menghitung derived data tertentu
- membuat activity log
- menyinkronkan metrik program dan initiative setelah perubahan data

### 6. Domain Layer
Folder `backend/src/domain/` berisi:
- `types.ts`
  Definisi type domain aplikasi
- `calculations.ts`
  Kumpulan fungsi derived/business calculations

Fungsi penting di `calculations.ts` antara lain:
- `computeWorkItemHealth`
- `computeInitiativeProgress`
- `computeInitiativeHealth`
- `computeProgramProgress`
- `computeProgramHealth`
- `computeRiskIndicator`
- `computeKpiStatus`
- `buildSearchableText`
- `computeUnreadCount`
- `applyDerivedMetrics`

### 7. Store Layer
`backend/src/store.ts` menyediakan seeded in-memory store.

Perannya:
- menjadi fallback ketika PostgreSQL/Prisma tidak siap
- menyimpan state aplikasi hasil `getInitialState()`
- menyediakan operasi domain seperti:
  - channels
  - messages
  - comments
  - programs
  - work items
  - blockers
  - notifications
  - presence
  - search
  - dashboard

## Strategi Persistence

Persistence utama memakai Prisma + PostgreSQL:
- schema berada di `backend/prisma/schema.prisma`
- client Prisma dibuat di `backend/src/lib/prisma.ts`

Namun aplikasi memiliki mode fallback penting:
- jika query `SELECT 1` ke database gagal, backend menandai database `unavailable`
- repository akan memakai `store` seeded in-memory
- endpoint `/api/system/status` mengembalikan mode persistence:
  - `database`
  - `fallback`

Ini berarti ATLAS dirancang agar UI dan API tetap bisa hidup walaupun DB lokal belum siap.

## Model Data Utama

Prisma schema menunjukkan domain bisnis yang cukup lengkap.

### Entitas Organisasi
- `User`
- `Directorate`
- `OrganizationalUnit`
- `Position`

Relasi penting:
- user bisa terkait ke directorate, unit, position, dan manager
- organizational unit mendukung hirarki parent-child
- position juga mendukung hirarki reports-to

### Entitas Eksekusi Program
- `Program`
- `Initiative`
- `WorkItem`
- `SubTask`

Relasi utama:
- satu `Program` memiliki banyak `Initiative`
- satu `Initiative` memiliki banyak `WorkItem`
- satu `WorkItem` memiliki banyak `SubTask`

Field bisnis penting:
- status
- priority
- progressPercent / percentComplete
- healthStatus
- riskScore / riskLevel
- budget
- target dates
- linked channel/thread

### Entitas Kolaborasi
- `Channel`
- `ChannelMember`
- `ChannelMessage`
- `Comment`

Karakteristik:
- channels mendukung tipe `PUBLIC` dan `PRIVATE`
- messages mendukung thread melalui `parentMessageId`
- comments juga mendukung reply tree
- ada reactions, attachments, pin/edit metadata, dan searchable text

### Entitas Monitoring dan Governance
- `UserStatus`
- `KpiDefinition`
- `KpiValue`
- `RiskIndicator`
- `Blocker`
- `ActivityLog`
- `SavedSearch`
- `Notification`
- `NotificationPreference`

## Pola API Berdasarkan Domain

Jelaskan juga bahwa desain API ATLAS berbasis domain resource, bukan RPC tunggal.

Contoh capability per domain:

### Auth
- login
- session restore
- logout
- forgot password
- options user login

### Channels
- list channel user
- get detail channel
- create/update/archive channel
- add/remove member
- mute/star membership
- list/create/edit/delete message
- get thread
- add/remove reaction
- pin message

### Programs
- list program
- get detail program
- create/update/delete program
- get timeline
- get health
- get linked messages
- add comments

### Initiatives
- list initiative
- get initiative detail
- get comments/discussions terkait

### Work Items
- list grouped work items
- get detail work item
- update status
- update progress
- create subtask
- get discussions
- add comments

### KPI
- list KPI
- get KPI detail/trend
- create KPI value

### Blockers
- list blockers
- create blocker
- update blocker status
- get blocker detail

### Presence
- list presence semua user
- get my status
- update my status
- get user presence tertentu

### Search
- full text search lintas entitas
- list saved searches
- save search
- delete saved search

### Notifications
- list notifications
- mark as read
- mark all as read

### Dashboard
- endpoint summary utama
- endpoint dimensi spesifik
- health summary

### System
- status service dan persistence mode

### Realtime
- SSE stream untuk snapshot workspace

## Dashboard dan Analitik

Dashboard bukan hanya ringkasan visual biasa. Dari route `dashboard.ts` terlihat ada beberapa dimensi yang dipisah menjadi endpoint terdedikasi:
- strategic
- programs
- leading indicators
- time intelligence
- risk
- accountability
- governance
- performance
- collaboration
- health summary

Jelaskan bahwa ini menunjukkan dashboard ATLAS dirancang sebagai governance cockpit, bukan sekadar task board.

## Mekanisme Realtime Backend

Realtime backend berada di `backend/src/routes/realtime.ts` dan menggunakan Server-Sent Events.

Karakteristik implementasi:
- endpoint: `GET /api/realtime/stream`
- user diidentifikasi dari token bearer atau query token
- server membangun snapshot yang berisi:
  - channels
  - presence
  - notifications
- snapshot dibandingkan lewat signature
- event `workspace:update` hanya dikirim jika ada perubahan bermakna
- heartbeat dikirim periodik agar koneksi tetap hidup

Ini berarti realtime dipakai untuk lightweight workspace synchronization, bukan full duplex websocket.

## Mekanisme Autentikasi Backend

Autentikasi backend masih sederhana dan cocok untuk environment internal/dev:
- token session bukan JWT penuh, melainkan string sederhana `atlas-session.<userId>`
- `resolveSessionUser()` memetakan token ke user aktif di store
- ada fallback melalui header `x-user-id`
- route login memvalidasi user berdasarkan `NIK` atau `userId`
- password default dibaca dari env, default value saat ini adalah `DKMR2026`

Jelaskan implikasinya:
- sederhana dan cepat untuk prototyping/internal app
- belum cocok untuk security model enterprise production tanpa hardening tambahan

## Alur Data End-to-End

Jelaskan alur tipikal berikut secara naratif:

### Contoh 1: Login
1. User submit identifier dan password dari `AuthEntryView`
2. Frontend memanggil `/auth/login`
3. Backend memvalidasi payload dengan Zod
4. Backend mencari user aktif di store
5. Backend membuat token session sederhana
6. Frontend menyimpan token ke `localStorage`
7. Frontend mengubah state auth menjadi signed-in
8. Frontend memuat overview workspace

### Contoh 2: Membuka channel dan mengirim pesan
1. User memilih channel di sidebar
2. Frontend memanggil detail channel dan daftar messages
3. User menulis composer
4. Frontend memanggil `POST /channels/:id/messages`
5. Backend menyimpan message melalui repository
6. searchable text dan metadata turunan ikut dibentuk
7. frontend merefresh overview dan channel detail
8. SSE dapat ikut memberi sinyal update ke klien lain

### Contoh 3: Mengubah status work item
1. User drag-and-drop item di workboard atau submit form status/progress
2. Frontend melakukan optimistic update lokal pada board
3. Frontend memanggil endpoint update status/progress
4. Repository backend menyimpan perubahan
5. metrik turunan initiative/program disinkronkan ulang
6. activity log dapat tercatat
7. frontend refresh detail dan overview

## File Penting yang Harus Disebut

Pastikan Anda menyebut peran file-file ini:
- `frontend/src/App.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/views/AuthEntryView.tsx`
- `frontend/src/views/ChannelsView.tsx`
- `frontend/src/types.ts`
- `frontend/vite.config.ts`
- `backend/src/app.ts`
- `backend/src/lib/auth.ts`
- `backend/src/lib/http.ts`
- `backend/src/lib/validation.ts`
- `backend/src/lib/prisma.ts`
- `backend/src/data-access/repository.ts`
- `backend/src/store.ts`
- `backend/src/domain/types.ts`
- `backend/src/domain/calculations.ts`
- `backend/prisma/schema.prisma`
- `backend/docs/postgresql-setup.md`

## Analisis Kelebihan Arsitektur

Berikan analisis kekuatan arsitektur ini, misalnya:
- pemisahan frontend dan backend cukup jelas
- domain bisnis cukup kaya dan eksplisit
- fallback mode membuat development lokal lebih tahan gangguan
- SSE dipakai secara pragmatis untuk realtime ringan
- repository menjadi abstraction layer tunggal untuk DB dan memory store
- validasi request cukup rapi dengan Zod

## Analisis Tradeoff dan Technical Debt

Berikan juga kritik konstruktif, misalnya:
- `App.tsx` terlalu besar dan memegang terlalu banyak orchestration state
- belum ada pemisahan frontend state ke custom hooks/store/query layer
- auth/session masih sederhana
- repository berpotensi terlalu gemuk
- store fallback dan DB path bisa menyulitkan konsistensi perilaku jika makin kompleks
- belum terlihat pemisahan service layer yang lebih granular

## Format Jawaban yang Diinginkan

Struktur jawaban wajib seperti ini:

1. Ringkasan Eksekutif
2. Gambaran Arsitektur Tingkat Tinggi
3. Struktur Folder dan Tanggung Jawab Modul
4. Arsitektur Frontend
5. Arsitektur Backend
6. Model Data dan Relasi Domain
7. Alur Data End-to-End
8. Mekanisme Realtime, Auth, dan Persistence
9. Kelebihan Arsitektur
10. Risiko, Tradeoff, dan Technical Debt
11. Kesimpulan

Tambahkan tabel jika membantu.
Jika relevan, tambahkan diagram ASCII atau Mermaid sederhana untuk:
- alur request frontend ke backend
- relasi Program -> Initiative -> WorkItem -> SubTask
- alur fallback Database -> InMemoryStore

Jangan menulis bahwa Anda “tidak punya akses repo”, karena konteks ini sudah merupakan hasil inspeksi repo.
Jangan menulis jawaban pendek. Fokus pada penjelasan yang konkret dan spesifik terhadap aplikasi ini.
```
