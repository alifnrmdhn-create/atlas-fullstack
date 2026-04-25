# Arsitektur: Perusahaan, Organisasi, Jabatan, Users & Role Permissions

> Dokumen ini menjelaskan secara lengkap arsitektur data dan logika bisnis untuk sistem pengaturan perusahaan, hierarki organisasi, jabatan, manajemen pengguna, dan role-based access control (RBAC) di aplikasi ERIN. Dibuat sebagai **blueprint replikasi** untuk project lain.

---

## Daftar Isi

1. [Gambaran Umum Arsitektur](#1-gambaran-umum-arsitektur)
2. [Database Schema](#2-database-schema)
3. [Auth & Session](#3-auth--session)
4. [Role & Permission System](#4-role--permission-system)
5. [Permission Matrix per Modul](#5-permission-matrix-per-modul)
6. [API Contracts](#6-api-contracts)
7. [Halaman Admin (Parameters UI)](#7-halaman-admin-parameters-ui)
8. [Profil & Hierarki Jabatan](#8-profil--hierarki-jabatan)
9. [Alur Bisnis Kritis](#9-alur-bisnis-kritis)
10. [Checklist Replikasi](#10-checklist-replikasi)

---

## 1. Gambaran Umum Arsitektur

```
┌────────────────────────────────────────────────────────────────────┐
│                         CORPORATE ENTITY                           │
│  corporates (isLegalEntity=true)  ←parent─  corporates (unit)     │
│  e.g. PTPN III Holding                      e.g. Divisi Manajemen │
└────────────────┬───────────────────────────────────┬───────────────┘
                 │                                   │
                 ▼                                   ▼
        ┌────────────────┐                  ┌─────────────────┐
        │   positions    │ ──parentPosition→ │   positions     │
        │  (jabatan)     │                  │  (jabatan atas) │
        └───────┬────────┘                  └────────┬────────┘
                │ positionId                          │ positionId
                ▼                                    ▼
        ┌────────────────┐                  ┌─────────────────┐
        │     users      │ ──supervisorId──▶│     users       │
        │  (user biasa)  │                  │  (atasan)       │
        └────────────────┘                  └─────────────────┘
```

### Prinsip Utama

| Prinsip | Penjelasan |
|---|---|
| **Position sebagai sumber kebenaran** | User tidak punya jabatan langsung. Jabatan diambil dari tabel `positions`. Ketika user di-assign ke posisi, field `users.position`, `corporateId`, `divisionId`, `unitId`, `supervisorId` di-sync otomatis. |
| **Hierarki melalui parentPositionId** | Atasan/bawahan tidak disimpan langsung. Dihitung saat runtime dengan walk naik/turun di `positions.parentPositionId`. |
| **Scope enforcement di semua API** | Admin scoped ke `corporateId` sendiri. Superadmin bisa lintas entitas. |
| **Multi-role support** | Satu user bisa punya beberapa role tersimpan di `availableRoles` (JSON). Role aktif ada di `users.role`. |

---

## 2. Database Schema

Stack: **PostgreSQL + Drizzle ORM**

### 2.1 Tabel `corporates` — Entitas Perusahaan & Unit Organisasi

```sql
CREATE TABLE "corporates" (
  "id"            TEXT PRIMARY KEY,
  "code"          TEXT NOT NULL UNIQUE,       -- e.g. "PTPN3-HLD", "DKMR-HLD"
  "name"          TEXT NOT NULL,              -- Nama lengkap
  "short_name"    TEXT,                       -- Nama singkat
  "entity_type"   TEXT CHECK (entity_type IN (
                    'holding',
                    'anak_perusahaan_level_1',
                    'anak_perusahaan_level_2'
                  )),                          -- Hanya untuk isLegalEntity=true
  "unit_type"     TEXT CHECK (unit_type IN (
                    'divisi', 'regional',
                    'bagian', 'kebun', 'pabrik'
                  )),                          -- Hanya untuk isLegalEntity=false
  "is_legal_entity" BOOLEAN NOT NULL DEFAULT true,
                                              -- true  = PT/Perusahaan
                                              -- false = Unit operasional (divisi, bagian)
  "parent_id"     TEXT REFERENCES "corporates"("id"),
                                              -- Self-referencing hierarki
  "address"       TEXT,
  "is_active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Contoh data:**
```
id          code          name                                    is_legal  entity_type           parent_id
─────────── ───────────── ─────────────────────────────────────── ───────── ─────────────────────  ──────────
ptpn3-hld   PTPN3-HLD     PTPN III (Persero) Holding              true      holding               NULL
data-hld    DATA-HLD      Direktorat Areal Tanaman                false     NULL (divisi)         ptpn3-hld
dkmr-hld    DKMR-HLD      Divisi Manajemen Risiko                 false     NULL (divisi)         ptpn3-hld
ptpn1       PTPN1         PT Perkebunan Nusantara I               true      anak_perusahaan_lvl1  ptpn3-hld
```

---

### 2.2 Tabel `divisions` — Sub-unit di dalam Corporate

```sql
CREATE TABLE "divisions" (
  "id"           TEXT PRIMARY KEY,
  "corporate_id" TEXT NOT NULL REFERENCES "corporates"("id"),
  "code"         TEXT,
  "name"         TEXT NOT NULL,
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

> **Catatan:** Dalam implementasi ERIN, `corporates` dengan `isLegalEntity=false` sudah berfungsi sebagai divisi/unit. Tabel `divisions` dipakai sebagai sub-klasifikasi tambahan jika diperlukan.

---

### 2.3 Tabel `positions` — Jabatan / Seat Organisasi

```sql
CREATE TABLE "positions" (
  "id"                   TEXT PRIMARY KEY,
  "corporate_id"         TEXT REFERENCES "corporates"("id"),
                                              -- Perusahaan tempat jabatan ini berada
  "unit_id"              TEXT REFERENCES "corporates"("id"),
                                              -- Unit/divisi tempat jabatan ini berada
  "title"                TEXT NOT NULL,       -- Nama jabatan, e.g. "Kepala Sub Divisi Kajian Risiko"
  "position_code"        TEXT UNIQUE,         -- Kode unik jabatan, e.g. "KDMR-HLD-01"
  "level"                TEXT CHECK (level IN ('BOD', 'BOD-1', 'BOD-2', 'BOD-3')),
                                              -- Level senioritas dalam org chart
  "role"                 TEXT NOT NULL DEFAULT 'staff'
                           CHECK (role IN (
                             'superadmin', 'admin',
                             'risk_lead', 'risk_supervisor', 'risk_officer', 'staff',
                             'risk_controller', 'compliance_officer',
                             'spi', 'external_auditor', 'bod', 'boc'
                           )),               -- Role sistem yang melekat pada jabatan ini
  "parent_position_id"   TEXT REFERENCES "positions"("id"),
                                              -- Jabatan atasan langsung (untuk hierarki)
  "position_type"        TEXT DEFAULT 'struktural'
                           CHECK (position_type IN ('struktural', 'non_struktural_adhoc')),
  "category"             TEXT DEFAULT 'kantor_pusat'
                           CHECK (category IN (
                             'kantor_pusat', 'regional', 'unit_usaha', 'manajemen_kso'
                           )),
  "is_risk_owner"        BOOLEAN NOT NULL DEFAULT false,
                                              -- Apakah jabatan ini adalah pemilik risiko
  "is_approver"          BOOLEAN NOT NULL DEFAULT false,
                                              -- Apakah jabatan ini bisa approve RCSA
  "description"          TEXT,
  "is_active"            BOOLEAN NOT NULL DEFAULT true,
  "created_at"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Hubungan hierarki jabatan (contoh):**
```
positions
─────────────────────────────────────────────────────────
id    title                                   role            parent_position_id  level
────  ──────────────────────────────────────  ──────────────  ──────────────────  ──────
P001  Direktur Manajemen Risiko               risk_lead       NULL                BOD-1
P002  Kepala Divisi Manajemen Risiko          risk_supervisor P001                BOD-2
P003  Kepala Sub Divisi Kajian Risiko         risk_supervisor P002                BOD-2
P004  Analis Senior Risiko                    risk_officer    P003                BOD-3
P005  Analis Risiko                           staff           P004                BOD-4
```

---

### 2.4 Tabel `users` — Pengguna Sistem

```sql
CREATE TABLE "users" (
  "id"               TEXT PRIMARY KEY,
  "name"             TEXT NOT NULL,
  "email"            TEXT NOT NULL UNIQUE,
  "email_verified"   BOOLEAN NOT NULL DEFAULT false,
  "image"            TEXT,

  -- Identitas korporat
  "nik"              TEXT UNIQUE,             -- Nomor Induk Karyawan
  "role"             TEXT NOT NULL DEFAULT 'staff'
                       CHECK (role IN (
                         'superadmin', 'admin',
                         'risk_lead', 'risk_supervisor', 'risk_officer', 'staff',
                         'risk_controller', 'compliance_officer',
                         'spi', 'external_auditor', 'bod', 'boc'
                       )),                    -- Role aktif saat ini
  "available_roles"  TEXT,                   -- JSON: ["risk_supervisor","risk_lead"]
                                              -- Multi-role switching support

  -- Org context (di-sync dari positions saat assignment)
  "position_id"      TEXT REFERENCES "positions"("id"),
  "position"         TEXT,                   -- Cache: positions.title
  "department"       TEXT,                   -- Cache: nama unit/divisi
  "corporate_id"     TEXT REFERENCES "corporates"("id"),
  "division_id"      TEXT REFERENCES "divisions"("id"),
  "unit_id"          TEXT REFERENCES "corporates"("id"),
  "supervisor_id"    TEXT REFERENCES "users"("id"),
                                              -- Di-resolve dari parentPositionId saat assignment

  "is_active"        BOOLEAN NOT NULL DEFAULT true,
  "created_at"       TIMESTAMP NOT NULL,
  "updated_at"       TIMESTAMP NOT NULL
);
```

---

### 2.5 Tabel `position_history` — Riwayat Mutasi/Promosi

```sql
CREATE TABLE "position_history" (
  "id"              TEXT PRIMARY KEY,
  "user_id"         TEXT NOT NULL REFERENCES "users"("id"),
  "position_id"     TEXT NOT NULL REFERENCES "positions"("id"),
  "start_date"      TIMESTAMP NOT NULL,
  "end_date"        TIMESTAMP,               -- NULL = masih aktif di posisi ini
  "mutation_type"   TEXT NOT NULL DEFAULT 'initial_assignment'
                      CHECK (mutation_type IN (
                        'initial_assignment', 'promotion', 'mutation',
                        'demotion', 'temporary_assignment', 'rotation'
                      )),
  "mutation_reason" TEXT,
  "sk_number"       TEXT,                   -- Nomor SK mutasi
  "created_by"      TEXT REFERENCES "users"("id"),
  "created_at"      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 2.6 Tabel `role_configs` — Konfigurasi Role (Editable)

```sql
CREATE TABLE "role_configs" (
  "role"        TEXT PRIMARY KEY,            -- Salah satu dari UserRole enum
  "description" TEXT NOT NULL DEFAULT '',   -- Deskripsi role (bisa di-edit admin)
  "updated_at"  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 2.7 Tabel Pendukung Auth

```sql
-- Sessions (login tracking, untuk "last login" di profile)
CREATE TABLE "sessions" (
  "id"          TEXT PRIMARY KEY,
  "user_id"     TEXT NOT NULL REFERENCES "users"("id"),
  "token"       TEXT NOT NULL UNIQUE,
  "expires_at"  TIMESTAMP NOT NULL,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMP NOT NULL,
  "updated_at"  TIMESTAMP NOT NULL
);

-- Accounts (credential storage, supports OAuth providers)
CREATE TABLE "accounts" (
  "id"                   TEXT PRIMARY KEY,
  "user_id"              TEXT NOT NULL REFERENCES "users"("id"),
  "account_id"           TEXT NOT NULL,
  "provider_id"          TEXT NOT NULL,    -- "credential" untuk email/password
  "access_token"         TEXT,
  "refresh_token"        TEXT,
  "password"             TEXT,             -- Bcrypt hash
  "created_at"           TIMESTAMP NOT NULL,
  "updated_at"           TIMESTAMP NOT NULL
);

-- Verifications (email verification, password reset tokens)
CREATE TABLE "verifications" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP,
  "updated_at" TIMESTAMP
);
```

---

### 2.8 Entity Relationship Diagram (ERD Ringkas)

```
corporates ──┐
  (parent)   │ 1:N
             ▼
corporates ──────────┐ 1:N
                     ▼
                 positions ──(parentPositionId)──▶ positions
                     │ 1:N
                     ▼
                   users ──(supervisorId)──▶ users
                     │
                     │ 1:N
                     ▼
              position_history

users ──▶ sessions  (last login)
users ──▶ accounts  (credentials)
```

---

## 3. Auth & Session

**Library:** [better-auth](https://better-auth.com) dengan Drizzle adapter

### Konfigurasi (`lib/auth.ts`)

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user:         schema.users,
      session:      schema.sessions,
      account:      schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role:           { type: "string",  defaultValue: "staff",  input: false },
      nik:            { type: "string",  required: false,        input: false },
      department:     { type: "string",  required: false,        input: true  },
      isActive:       { type: "boolean", defaultValue: true,     input: false },
      corporateId:    { type: "string",  required: false,        input: false },
      positionId:     { type: "string",  required: false,        input: false },
      availableRoles: { type: "string",  required: false,        input: false },
    },
  },
});
```

### Cara Baca Session di Server Component / Route Handler

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect("/login");

const user = session.user as typeof session.user & {
  role?: string;
  nik?: string;
  corporateId?: string;
  positionId?: string;
  availableRoles?: string;
  isActive?: boolean;
};
```

### Default Password Pengguna Baru

```typescript
const DEFAULT_PASSWORD = "DKMR2026";
// Di-hash via better-auth's hashPassword() sebelum disimpan ke accounts.password
```

---

## 4. Role & Permission System

### 4.1 Daftar Role

```typescript
// lib/constants/roles.ts

export type UserRole =
  | "superadmin"         // System — Full access
  | "admin"              // System — Entity-scoped admin
  | "risk_lead"          // 1st Line — BOD-1, Pemilik Risiko Senior
  | "risk_supervisor"    // 1st Line — BOD-2, Pengawas Risiko Unit
  | "risk_officer"       // 1st Line — BOD-2/3, Pelaksana Risiko
  | "staff"              // 1st Line — BOD-3+, Pelaksana Operasional
  | "risk_controller"    // 2nd Line — Fungsi Manajemen Risiko Independen
  | "compliance_officer" // 2nd Line — Fungsi Kepatuhan Independen
  | "spi"                // 3rd Line — Satuan Pengawasan Intern
  | "external_auditor"   // External — BPK / KAP / Auditor Eksternal
  | "bod"                // Governance — Board of Directors
  | "boc";               // Governance — Board of Commissioners
```

### 4.2 Metadata Role

```typescript
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin:         "Superadmin",
  admin:              "Admin",
  risk_lead:          "Risk Lead",
  risk_supervisor:    "Risk Supervisor",
  risk_officer:       "Risk Officer",
  staff:              "Staff",
  risk_controller:    "Risk Controller",
  compliance_officer: "Compliance Officer",
  spi:                "SPI",
  external_auditor:   "External Auditor",
  bod:                "BOD",
  boc:                "BOC",
};

// Pengelompokan Three Lines Model
export const ROLE_LINE: Partial<Record<UserRole, string>> = {
  staff:              "1st Line",
  risk_officer:       "1st Line",
  risk_supervisor:    "1st Line",
  risk_lead:          "1st Line",
  risk_controller:    "2nd Line",
  compliance_officer: "2nd Line",
  spi:                "3rd Line",
  external_auditor:   "External",
  bod:                "Governance",
  boc:                "Governance",
};

// Level BOD (untuk tampilan di UI)
export const ROLE_BOD_LEVEL: Partial<Record<UserRole, string>> = {
  risk_lead:       "BOD-1",
  risk_supervisor: "BOD-2",
  risk_officer:    "BOD-3",
  staff:           "BOD-4/5",
};

// Badge color (Tailwind classes)
export const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  superadmin:         "bg-purple-100 text-purple-800 border-purple-300",
  admin:              "bg-purple-100 text-purple-600 border-purple-200",
  risk_lead:          "bg-red-100    text-red-700    border-red-200",
  risk_supervisor:    "bg-orange-100 text-orange-700 border-orange-200",
  risk_officer:       "bg-amber-100  text-amber-700  border-amber-200",
  staff:              "bg-blue-100   text-blue-700   border-blue-200",
  risk_controller:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  compliance_officer: "bg-cyan-100   text-cyan-700   border-cyan-200",
  spi:                "bg-teal-100   text-teal-700   border-teal-200",
  external_auditor:   "bg-gray-100   text-gray-600   border-gray-300",
  bod:                "bg-indigo-100 text-indigo-700 border-indigo-200",
  boc:                "bg-violet-100 text-violet-700 border-violet-200",
};
```

### 4.3 Fungsi Permission Utama

```typescript
// lib/utils/permissions.ts  (atau lib/constants/roles.ts)

// ── Scope check ──────────────────────────────────────────────────────

export function isAdminOrAbove(role: UserRole | string): boolean {
  return role === "superadmin" || role === "admin";
}

export function isSuperadmin(role: UserRole | string): boolean {
  return role === "superadmin";
}

export function is1stLine(role: UserRole): boolean {
  return ["risk_lead", "risk_supervisor", "risk_officer", "staff"].includes(role);
}

export function is2ndLine(role: UserRole): boolean {
  return ["risk_controller", "compliance_officer"].includes(role);
}

// ── Data management ──────────────────────────────────────────────────

export function canManageUsers(role: UserRole): boolean {
  return isAdminOrAbove(role);
}

export function canManageParameters(role: UserRole): boolean {
  return isAdminOrAbove(role);
}

export function canCreateRisk(role: UserRole): boolean {
  return isAdminOrAbove(role)
    || role === "risk_lead"
    || role === "risk_supervisor"
    || role === "risk_officer"
    || role === "risk_controller";
}

export function canEditRisk(role: UserRole, isOwner: boolean): boolean {
  if (isAdminOrAbove(role) || role === "risk_controller") return true;
  if (["risk_lead", "risk_supervisor", "risk_officer"].includes(role) && isOwner) return true;
  return false;
}

export function canViewAllEntities(role: UserRole): boolean {
  return role === "superadmin"
    || role === "risk_controller"   // Holding risk controller
    || role === "spi"
    || role === "external_auditor"
    || role === "bod"
    || role === "boc";
}

// ── RCSA Approval chain (1st Line only) ──────────────────────────────
//
//  risk_officer → risk_supervisor → risk_lead (terminal)
//  2nd Line adalah reviewer, BUKAN approval node

export function canApproveRCSAFor(
  creatorRole: UserRole | string,
  actorRole: UserRole
): boolean {
  if (isAdminOrAbove(actorRole)) return true;
  switch (creatorRole) {
    case "risk_officer":
      return actorRole === "risk_supervisor" || actorRole === "risk_lead";
    case "risk_supervisor":
      return actorRole === "risk_lead";
    case "risk_lead":
      return actorRole === "risk_lead"; // terminal
    default:
      return false;
  }
}

// ── HELIX (Risk Modelling) permissions ───────────────────────────────

export interface HelixPermCtx {
  userRole: UserRole;
  userCorporateId: string | null;
  isHoldingEntity: boolean;
  modelCorporateId?: string | null;
}

export function canCreateModel(ctx: HelixPermCtx): boolean {
  return isAdminOrAbove(ctx.userRole) || ctx.userRole === "risk_controller";
}

export function canRunSimulation(ctx: HelixPermCtx): boolean {
  if (isAdminOrAbove(ctx.userRole)) return true;
  if (ctx.userRole === "risk_controller" && ctx.isHoldingEntity) return true;
  if (ctx.userRole === "risk_controller" && ctx.userCorporateId === ctx.modelCorporateId) return true;
  if (ctx.userRole === "risk_officer"    && ctx.userCorporateId === ctx.modelCorporateId) return true;
  return false;
}
```

---

## 5. Permission Matrix per Modul

Tabel ini merangkum hak akses per role di setiap modul utama.

> **Legenda:** ✅ Full &nbsp; 🟡 Partial/Own-only &nbsp; 👁 Read-only &nbsp; ❌ No access

### 5.1 System & Administration

| Fitur | superadmin | admin | risk_lead | risk_supervisor | risk_officer | staff | risk_controller | compliance_officer | spi | external_auditor | bod | boc |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Manage Users | ✅ | 🟡* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Positions | ✅ | 🟡* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Corporates | ✅ | 🟡* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage Parameters | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Role Config (edit desc) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

> *Admin scoped ke `corporateId` sendiri, tidak bisa buat admin/superadmin lain.

### 5.2 Risk Register

| Fitur | superadmin | admin | risk_lead | risk_supervisor | risk_officer | staff | risk_controller | compliance_officer | spi | ext_auditor | bod | boc |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create Risk | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Risk (own) | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete Risk | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View All Risks | ✅ | 🟡* | 🟡* | 🟡* | 🟡* | 🟡* | ✅ | ✅ | ✅ | 👁 | 👁 | 👁 |

### 5.3 RCSA (Assessment)

| Fitur | risk_lead | risk_supervisor | risk_officer | staff | risk_controller | compliance_officer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Buat RCSA | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Submit RCSA | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve RCSA (dari risk_officer) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve RCSA (dari risk_supervisor) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Review/Reject RCSA | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### 5.4 Risk Modelling (HELIX)

| Fitur | superadmin | admin | risk_controller (holding) | risk_controller (entity) | risk_officer | risk_supervisor | risk_lead |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create Model | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Model | ✅ | ✅ | ✅ | 🟡* | ❌ | ❌ | ❌ |
| Run Simulation | ✅ | ✅ | ✅ | 🟡* | 🟡* | ❌ | ❌ |
| Back-test | ✅ | ✅ | ✅ | 🟡* | 🟡* | ❌ | ❌ |
| View Models | ✅ | ✅ | ✅ | 🟡* | 🟡* | 🟡* | 🟡* |

> *Scoped ke `corporateId` yang sama dengan model.

---

## 6. API Contracts

### 6.1 `GET /api/users` — Daftar Pengguna

**Authorization:** Admin atau Superadmin

**Query params:**
```
?search=    Cari nama/NIK/email
?corporate= Filter by corporateId
?role=      Filter by role
?active=    "true"|"false"
```

**Response:**
```typescript
{
  data: Array<{
    id: string;
    name: string;
    email: string;
    nik: string | null;
    role: UserRole;
    availableRoles: UserRole[];   // parsed dari JSON
    position: string | null;
    department: string | null;
    corporateId: string | null;
    corporateName: string | null;
    divisionId: string | null;
    unitId: string | null;
    supervisorId: string | null;
    supervisorName: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

**Scope enforcement:**
```typescript
// Di dalam handler:
if (!isAdminOrAbove(sessionUser.role)) return 403;
if (sessionUser.role !== "superadmin") {
  // Admin hanya lihat user di entity sendiri
  query.where(eq(users.corporateId, sessionUser.corporateId));
}
```

---

### 6.2 `POST /api/users` — Buat Pengguna

**Authorization:** Admin atau Superadmin

**Request body:**
```typescript
{
  name: string;          // required
  email: string;         // required, unique
  nik?: string;          // optional, unique
  role: UserRole;        // required
  positionId?: string;   // optional — jika diisi, sync otomatis
  corporateId?: string;  // required jika tidak ada positionId
  divisionId?: string;
  isActive?: boolean;    // default true
}
```

**Logika saat `positionId` diisi:**
```typescript
const position = await db.query.positions.findFirst({
  where: eq(positions.id, body.positionId)
});

// Sync dari position
userData.role          = position.role;
userData.corporateId   = position.corporateId;
userData.unitId        = position.unitId;
userData.position      = position.title;

// Resolve supervisor dari parentPositionId
if (position.parentPositionId) {
  const supervisor = await db.query.users.findFirst({
    where: eq(users.positionId, position.parentPositionId)
  });
  if (supervisor) userData.supervisorId = supervisor.id;
}

// Catat di position_history
await db.insert(positionHistory).values({
  userId: newUser.id,
  positionId: body.positionId,
  startDate: new Date(),
  mutationType: "initial_assignment",
  createdBy: sessionUser.id,
});
```

**Default password:**
```typescript
const hashedPassword = await auth.api.hashPassword(DEFAULT_PASSWORD);
await db.insert(accounts).values({
  userId: newUser.id,
  accountId: newUser.id,
  providerId: "credential",
  password: hashedPassword,
});
```

---

### 6.3 `GET /api/profile` — Profil Lengkap + Hierarki

**Authorization:** Logged-in user (own profile)

**Response:**
```typescript
{
  id: string;
  name: string;
  email: string;
  nik: string | null;
  role: string;
  position: string | null;
  department: string | null;
  corporateId: string | null;
  corporateName: string | null;
  divisionId: string | null;
  divisionName: string | null;
  unitId: string | null;
  unitName: string | null;
  supervisorId: string | null;
  supervisorName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;        // dari sessions table
  hierarchy: {
    supervisorChain: HierarchyNode[];  // [atasan, atasan atasan, ...]
    current: HierarchyNode;
    subordinates: HierarchyNode[];    // satu level di bawah
  };
}

type HierarchyNode = {
  id: string;
  name: string;
  position: string | null;    // jabatan
  role: string | null;        // risk role
  isCurrent?: boolean;
};
```

**Logika hierarki:**
```typescript
// Supervisor chain: walk naik dari positionId
async function getSupervisorChain(positionId: string): Promise<HierarchyNode[]> {
  const chain: HierarchyNode[] = [];
  let currentPositionId = positionId;

  while (currentPositionId) {
    const pos = await db.query.positions.findFirst({
      where: eq(positions.id, currentPositionId),
      with: { assignedUser: true },
    });
    if (!pos?.parentPositionId) break;

    const supervisor = await db.query.users.findFirst({
      where: eq(users.positionId, pos.parentPositionId),
    });
    if (supervisor) chain.push({ id: supervisor.id, name: supervisor.name, position: supervisor.position, role: supervisor.role });
    currentPositionId = pos.parentPositionId;
  }
  return chain;
}

// Subordinates: find users whose positionId.parentPositionId = currentPositionId
async function getSubordinates(positionId: string): Promise<HierarchyNode[]> {
  const childPositions = await db.query.positions.findMany({
    where: eq(positions.parentPositionId, positionId),
  });
  const subs: HierarchyNode[] = [];
  for (const childPos of childPositions) {
    const assignee = await db.query.users.findFirst({
      where: eq(users.positionId, childPos.id),
    });
    if (assignee) subs.push({ id: assignee.id, name: assignee.name, position: assignee.position, role: assignee.role });
  }
  return subs;
}
```

---

### 6.4 `GET /api/positions` — Daftar Jabatan

**Authorization:** Admin atau Superadmin

**Query params:**
```
?corporateId=   Filter by entitas
?unitId=        Filter by unit
?vacant=true    Hanya jabatan yang belum ada penghuninya
?withUser=true  Sertakan data user yang menjabat
```

**Response:**
```typescript
{
  data: Array<{
    id: string;
    title: string;
    positionCode: string | null;
    level: string | null;
    role: UserRole;
    corporateId: string | null;
    corporateName: string | null;
    unitId: string | null;
    unitName: string | null;
    parentPositionId: string | null;
    parentPositionTitle: string | null;
    isRiskOwner: boolean;
    isApprover: boolean;
    isActive: boolean;
    // Jika withUser=true:
    assignedUser?: {
      id: string;
      name: string;
      nik: string | null;
    } | null;
  }>;
}
```

---

### 6.5 `GET /api/corporates` — Daftar Entitas

**Authorization:** Semua authenticated user (read), Admin/Superadmin (write)

**Response:**
```typescript
{
  data: Array<{
    id: string;
    code: string;
    name: string;
    shortName: string | null;
    entityType: string | null;
    unitType: string | null;
    isLegalEntity: boolean;
    parentId: string | null;
    parentName: string | null;
    isActive: boolean;
  }>;
}
```

---

### 6.6 `PUT /api/profile` — Update Profil Sendiri

**Authorization:** Logged-in user (own profile only)

**Request body:**
```typescript
// Update email:
{ action: "update_email", email: string }

// Update password:
{ action: "change_password", currentPassword: string, newPassword: string }
```

---

### 6.7 `POST /api/users/me/switch-role` — Ganti Role Aktif

**Authorization:** Logged-in user

**Request body:**
```typescript
{ role: UserRole }   // Harus ada di users.availableRoles
```

**Logika:**
```typescript
const availableRoles = JSON.parse(user.availableRoles || "[]") as UserRole[];
if (!availableRoles.includes(body.role)) return 403;

await db.update(users).set({ role: body.role }).where(eq(users.id, sessionUser.id));
// UI kemudian reload halaman untuk refresh session
```

---

## 7. Halaman Admin (Parameters UI)

### 7.1 Struktur Menu di `/parameters` atau `/administration`

```
System & Access
├── Companies & Entities   (/parameters/corporate)
│     Tab 1: Tabel         — daftar entity (legal & unit)
│     Tab 2: Hierarki      — tree view org chart
├── Positions              (/parameters/positions)
│     Filter: entitas, unit, level, status
│     Action: tambah, edit, assign user
├── Users                  (/users atau /parameters/users)
│     Filter: entitas, role, status
│     Action: tambah, edit, non-aktifkan, reset password
└── Roles & Permissions    (/parameters/roles)
      Tab 1: Daftar role   — nama, deskripsi (editable), line
      Tab 2: Permission matrix — tabel role × modul
```

### 7.2 Companies & Entities Page

**Dua tab utama:**

1. **Tab "Tabel"** — grid flat semua entity:
   - Kolom: No, Corporate Name, Nama Singkat, Code, Tipe, Klasifikasi, Parent, Actions
   - Actions: Edit, Activate/Deactivate
   - Filter: Tipe entity, status aktif

2. **Tab "Hierarki"** — tree expandable:
   - Root: Holding (level 0)
   - Children: Anak perusahaan (level 1, 2)
   - Leaves: Unit operasional (divisi, bagian, kebun)

### 7.3 Positions Page

**Summary cards di atas:**
```
Total: 162  |  Sort: 173  |  Kosong: 18  |  BOD-1: 16  |  BOD-2: 46  |  Staff: 129
```

**Kolom tabel:**
- No, Entitas, DAPK (kode jabatan), Jabatan (title), Unit, Level, Posisi (parentPositionId), Tipe, Tanggung (isApprover), Nama Pejabat, Role badge, Actions

**Filter:** Semua Entitas → Semua Unit → Semua Level

### 7.4 Users Page

**Kolom tabel:**
- Avatar, Nama, NIK, Entitas, Unit, Jabatan (dari positions.title), Peran (role badge), Status (online/offline + aktif/nonaktif), Actions (edit, toggle aktif)

**Actions:**
- Tambah user → form dengan nama, email, NIK, entitas, jabatan (dropdown positions), role
- Edit user → update field + assign ke jabatan baru (trigger positionHistory entry)
- Reset password → set ke default (`DKMR2026`)
- Toggle aktif/nonaktif

### 7.5 Roles & Permissions Page

**Tab 1: Daftar Role**

Dikelompokkan per "Three Lines Model":

```
System
  Superadmin — [deskripsi editable]
  Admin      — [deskripsi editable]

1st Line — Pemilik & Pelaksana Risiko
  Risk Lead       (BOD-1)
  Risk Supervisor (BOD-2)
  Risk Officer    (BOD-2)
  Staff

2nd Line — Fungsi Independen
  Risk Controller
  Compliance Officer

3rd Line — Audit Internal
  SPI

External — Audit Eksternal
  External Auditor

Governance
  BOC
  BOD
```

**Tab 2: Permission Matrix**

Tabel lengkap: baris = role, kolom = modul/fitur. Setiap cell menampilkan:
- Dot hijau = akses penuh
- Dot kuning = akses parsial/terbatas
- Kosong = tidak ada akses

---

## 8. Profil & Hierarki Jabatan

### 8.1 Struktur Data yang Ditampilkan

Halaman `/profile` menampilkan 4 kartu utama:

**Kartu 1 — Informasi Pribadi:**
```
Nama Lengkap      : [users.name]
NIK / Employee ID  : [users.nik]
Email             : [users.email]          (editable)
Role              : [role badge]
```

**Kartu 2 — Organisasi:**
```
Perusahaan        : [corporates.name]      via users.corporateId
Unit Kerja        : [divisions/corporates] via users.unitId
Jabatan           : [positions.title]      via users.positionId
Atasan Langsung   : [users.name]           via users.supervisorId
```

**Kartu 3 — Hierarki Jabatan:**
```
Visual tree yang menampilkan:

  [Eman Suwanto]          ← supervisorChain[0]  (Risk Lead)
  ┌──────┘
  [Alif Nugraha Ramadhan] ← current             (Risk Supervisor) ⬅ Anda
  ├── [Fadli Kurniawan]   ← subordinates[0]      (Staff)
  └── [Emi Anggar]        ← subordinates[1]      (Staff)
```

### 8.2 Komponen UI Hierarki

```tsx
// Pseudocode struktur komponen

function HierarchySection({ hierarchy }: { hierarchy: ProfileHierarchy }) {
  const { supervisorChain, current, subordinates } = hierarchy;

  return (
    <div className="space-y-2">
      {/* Supervisor (atasan) */}
      {supervisorChain.map((sup, i) => (
        <HierarchyCard key={sup.id} node={sup} indent={i} type="supervisor" />
      ))}

      {/* Current user */}
      <HierarchyCard node={current} isCurrent type="current" />

      {/* Subordinates (bawahan langsung) */}
      {subordinates.map((sub) => (
        <HierarchyCard key={sub.id} node={sub} indent={1} type="subordinate" />
      ))}
    </div>
  );
}

function HierarchyCard({ node, isCurrent, type, indent }) {
  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-xl border",
      isCurrent && "border-emerald-200 bg-emerald-50",
      type === "supervisor" && "border-gray-200 bg-white",
      type === "subordinate" && "border-gray-100 bg-gray-50",
    )}>
      <Avatar name={node.name} />
      <div>
        <p className="font-semibold">{node.name}</p>
        <p className="text-sm text-gray-500">{node.position}</p>
      </div>
      <RoleBadge role={node.role} />
    </div>
  );
}
```

---

## 9. Alur Bisnis Kritis

### 9.1 Alur Onboarding User Baru

```
Admin membuka Users → Tambah
  ↓
Isi form: nama, email, NIK, pilih jabatan (dropdown positions)
  ↓
System: POST /api/users
  ↓
  1. Validasi email & NIK unik
  2. Buat record di `users`
     - role  ← dari positions.role
     - position ← positions.title
     - corporateId/unitId/divisionId ← dari positions
     - supervisorId ← user yang menjabat parentPositionId
  3. Buat record di `accounts` (password default: DKMR2026)
  4. Insert ke `position_history` (mutationType: "initial_assignment")
  ↓
User dapat login dengan email + DKMR2026
  ↓
User mengganti password di /profile
```

### 9.2 Alur Mutasi/Promosi User

```
Admin buka user → Edit → Pilih jabatan baru
  ↓
System: PATCH /api/users/:id
  ↓
  1. Tutup position_history lama: set endDate = NOW()
  2. Update users:
     - positionId ← jabatan baru
     - position  ← jabatan baru title
     - role      ← jabatan baru role
     - corporateId/unitId/supervisorId ← re-sync dari jabatan baru
  3. Insert position_history baru (mutationType: "mutation"|"promotion")
  ↓
User login berikutnya → session baru dengan role baru
```

### 9.3 Alur Resolusi Supervisor di Profile

```
GET /api/profile
  ↓
  1. Baca users.positionId = P003
  2. Cari positions WHERE id = P003 → parentPositionId = P002
  3. Cari users WHERE positionId = P002 → dapat supervisorId = USR-002
  4. supervisorName = users[USR-002].name
  ↓
  5. Untuk hierarchy.supervisorChain:
     - Walk naik: P003 → P002 → P001 → NULL (stop)
     - Untuk tiap positionId dalam chain, cari user yang menjabat
  6. Untuk hierarchy.subordinates:
     - Cari positions WHERE parentPositionId = P003
     - Untuk tiap position, cari user yang menjabat
  ↓
Return profile dengan hierarki lengkap
```

### 9.4 Scope Enforcement Pattern (Semua API)

```typescript
// Pattern ini WAJIB ada di setiap API route yang mengakses data organisasi

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userRole = session.user.role as UserRole;
  const userCorporateId = session.user.corporateId as string | null;

  // 1. Role check
  if (!isAdminOrAbove(userRole)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Scope: superadmin sees all, admin sees own entity
  const whereClause = userRole === "superadmin"
    ? undefined
    : eq(targetTable.corporateId, userCorporateId!);

  const data = await db.query.targetTable.findMany({ where: whereClause });
  return Response.json({ data });
}
```

---

## 10. Checklist Replikasi

Gunakan checklist ini saat mengimplementasi sistem yang sama di project lain.

### Database
- [ ] Buat tabel `corporates` dengan self-referencing `parentId`
- [ ] Buat tabel `positions` dengan `parentPositionId` dan `role` field
- [ ] Buat tabel `position_history` untuk audit trail mutasi
- [ ] Buat tabel `users` dengan field: `role`, `nik`, `positionId`, `corporateId`, `unitId`, `supervisorId`, `availableRoles`
- [ ] Buat tabel `role_configs` untuk deskripsi role yang editable
- [ ] Buat tabel `sessions`, `accounts`, `verifications` untuk auth

### Auth
- [ ] Setup better-auth dengan drizzle adapter
- [ ] Daftarkan `additionalFields`: role, nik, corporateId, positionId, availableRoles, isActive
- [ ] Set default password (`DKMR2026` atau sesuai kebijakan)
- [ ] Buat endpoint `POST /api/users/me/switch-role` untuk multi-role switching

### Role System
- [ ] Definisikan `UserRole` type dengan semua role enum
- [ ] Buat `ROLE_LABELS`, `ROLE_LINE`, `ROLE_BOD_LEVEL`, `ROLE_BADGE_COLORS`
- [ ] Buat fungsi permission: `isAdminOrAbove`, `canManageUsers`, `canCreateRisk`, `canApproveRCSAFor`, dll.
- [ ] Buat `role_configs` seed data untuk deskripsi default tiap role

### API Routes
- [ ] `GET/POST /api/users` — list & create, dengan scope enforcement
- [ ] `GET/PATCH /api/users/:id` — detail & update, dengan sync position
- [ ] `GET /api/profile` — profil lengkap + hierarki jabatan
- [ ] `PUT /api/profile` — update email & password sendiri
- [ ] `GET/POST /api/positions` — manajemen jabatan
- [ ] `GET/POST /api/corporates` — manajemen entitas
- [ ] `GET/PUT /api/role-configs` — konfigurasi deskripsi role

### Frontend
- [ ] Halaman **Companies & Entities** (tabel + hierarki tree)
- [ ] Halaman **Positions** (tabel jabatan dengan summary stats)
- [ ] Halaman **Users** (tabel pengguna dengan filter & actions)
- [ ] Halaman **Roles & Permissions** (list role + permission matrix)
- [ ] Halaman **Profile** dengan 3 kartu: info pribadi, organisasi, hierarki jabatan

### Profile — Hierarki Jabatan
- [ ] API: resolve `supervisorChain` dengan walk naik di `parentPositionId`
- [ ] API: resolve `subordinates` dengan find positions WHERE `parentPositionId = currentPositionId`
- [ ] UI: tampilkan tree supervisor (atas) → user (tengah, highlight) → bawahan (bawah)
- [ ] UI: tiap node tampilkan nama, jabatan, role badge

### Validasi & Keamanan
- [ ] Semua API check session & role sebelum proses
- [ ] Admin scoped ke `corporateId` sendiri (tidak bisa akses entity lain)
- [ ] Admin tidak bisa buat/edit user dengan role admin/superadmin
- [ ] Saat assign user ke jabatan: sync role/corporateId/supervisorId otomatis
- [ ] Password hashed via bcrypt/better-auth, tidak pernah disimpan plain

---

*Dokumen ini dihasilkan dari kode aktual ERIN. Semua nama tabel, kolom, enum value, dan logika permission adalah implementasi yang sudah berjalan.*
