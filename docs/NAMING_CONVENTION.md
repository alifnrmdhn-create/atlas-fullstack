# ATLAS — Naming Convention & Table Mapping

## Frontend/API ↔ PHP Model ↔ Database

| Frontend / API term | PHP Model class | DB Table (`$table`) | Notes |
|---|---|---|---|
| `program` | `Program` | `Program` | — |
| `workstream` | `Workstream` | `Initiative` | Prisma `@@map("Initiative")` |
| `task` / `step` | `Task` | `WorkItem` | Prisma `@@map("WorkItem")` |
| `phase` | `Phase` | `Phase` | — |
| `blocker` | `Blocker` | `Blocker` | — |
| `kpi` | `KpiDefinition` | `KpiDefinition` | — |
| `user` | `User` | `User` | — |
| `unit` | `OrganizationalUnit` | `OrganizationalUnit` | — |

## Foreign Key Mapping

| Relation | FK column in child table |
|---|---|
| `Workstream.program` | `Initiative.programId` |
| `Task.workstream` | `WorkItem.initiativeId` |
| `Blocker.task` | `Blocker.workItemId` |
| `Phase.workstream` | `Phase.initiativeId` |
| `EntityPic.entity` | `entity_pics.entityId` + `entityType` |

## Timestamp Columns

All models use **camelCase** timestamps:
- `createdAt` / `updatedAt` (not `created_at` / `updated_at`)
- Declared via `const CREATED_AT = 'createdAt'` / `const UPDATED_AT = 'updatedAt'` in every model.

## Column Casing

- All DB columns: **camelCase** (matches Prisma convention from legacy schema)
- Exception: `entity_pics` table uses snake_case (Laravel-generated, normalized later)

## Health Status Vocabulary

| Internal value | Display label |
|---|---|
| `GREEN` | On Track |
| `YELLOW` | At Risk |
| `RED` | Terlambat |
| computed from `targetEndDate` | Lewat Tenggat (Overdue) |

## Approval Status Flow

```
DRAFT → PENDING_KASUB → PENDING_KADIV → ACTIVE → COMPLETED
                    ↘ REJECTED (back to DRAFT)
DRAFT → ACTIVE  (KADIV/Admin via activate endpoint)
```
