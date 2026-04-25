# ULTIMATE MASTER PROMPT v3: PTPN-KMR Complete Enterprise Platform
## Monday.com + Jira + Slack + PTPN 8-Dimensi Dashboard
## Production-Ready Collaboration & Program Management System

---

## COPY & PASTE ENTIRE PROMPT KE CLAUDE CODE

```
You are building PTPN-KMR: Enterprise Program Management & Collaboration System
combining BEST FEATURES from:
- Monday.com (visual management, automation, customization)
- Jira (issue tracking, workflow, bulk operations, audit trail)
- Slack (channels, threading, search, presence, collaboration)
- PLUS: PTPN's proprietary 8-dimensi monitoring dashboard

PROJECT CONTEXT:
- Organization: PT Perkebunan Nusantara III (PTPN)
- Department: Direktorat Keuangan & Manajemen Risiko (KMR)
- Users: 50-100 (Direksi, Kadiv, Kasubdiv, Officers)
- Update Frequency: Daily with real-time collaboration
- Tech Stack: React 18 + TypeScript, Node.js + Express, PostgreSQL
- Architecture: MAMP environment (Apache 8888, Backend 3001, Frontend 5173)
- Production Timeline: MVP v1 in 3 weeks, v2 with full features in 5 weeks

CRITICAL SUCCESS FACTORS:
1. Complete Slack-like collaboration (not just comments)
2. All 8-dimensi PTPN dashboard data accessible
3. Monday.com-level visual management
4. Jira-level issue tracking & workflow
5. Full TypeScript, production-grade code quality
6. Real-time feel (activity updates, presence, notifications)
7. Searchable & discoverable (knowledge management)
8. Audit trail for governance/compliance

## PART 0: ARCHITECTURE OVERVIEW

### THREE LAYERS:

Layer 1: WORKSPACE ORGANIZATION (Slack-inspired)
- Channels (team conversations, program channels, topic channels)
- Channel messages with threading
- Members & access control
- Real-time activity

Layer 2: PROGRAM EXECUTION (Monday.com + Jira)
- Programs → Initiatives → WorkItems → SubTasks
- Kanban board (drag-drop status)
- Timeline/Gantt views
- KPI tracking
- Blocker/issue management
- Risk management

Layer 3: INSIGHTS & GOVERNANCE (PTPN 8-Dimensi)
- Strategic alignment (Dimensi 1)
- Program portfolio monitoring (Dimensi 2)
- Leading indicators (Dimensi 3)
- Time intelligence (Dimensi 4)
- Risk early warning (Dimensi 6)
- Accountability views (Dimensi 7)
- Governance controls (Dimensi 8)
- Performance scoring (Dimensi 9)
- Collaboration feed (Dimensi 10)

### FEATURE MATRIX:

From Monday.com:
✓ Timeline/Gantt charts
✓ Kanban board (drag-drop)
✓ Table/database views
✓ Automation (status updates, progress calculation)
✓ Customization (tags, custom fields)
✓ Collaboration (comments, @mentions, activity)
✓ Favorites/pin system

From Jira:
✓ Blocker/issue tracking (comprehensive workflow)
✓ Bulk operations & advanced filtering
✓ Workflow state machines
✓ Priority & severity levels
✓ Dependency tracking
✓ Activity audit trail
✓ Relationship linking (blocks, relates-to)

From Slack (NEW - CRITICAL):
✓ Channels (public/private, organized by team/program/topic)
✓ Channel messages with THREADING (conversations organized)
✓ User presence & status (who's online, custom status)
✓ Emoji reactions (quick feedback on messages)
✓ Full-text search with advanced filters
✓ @channel & @here mentions (beyond @username)
✓ Rich text formatting (bold, code, links, images)
✓ Pinned/starred messages (important items stay visible)
✓ Member management per channel

From PTPN:
✓ 8-dimensi dashboard (all 10 dimensions integrated)
✓ Health status visualization (GREEN/YELLOW/RED)
✓ Risk scoring (probability × impact)
✓ Leading indicator monitoring
✓ Performance composite scoring
✓ Governance controls & audit trail

## PART 1: DATABASE SCHEMA (Prisma - COMPREHENSIVE v3)

Create: backend/prisma/schema.prisma

### Core Models (Original):

```prisma
model User {
  id Int @id @default(autoincrement())
  email String @unique
  name String
  phone String?
  roleType String // DIREKSI, KADIV, KASUBDIV, OFFICER
  unitId Int?
  avatarUrl String?
  isActive Boolean @default(true)
  preferences Json? // notification preferences, theme, etc
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([unitId])
  @@index([roleType])
}

model OrganizationalUnit {
  id Int @id @default(autoincrement())
  code String @unique
  name String
  description String?
  unitType String // DIRECTORAT, DIVISI, SUB_DIVISI
  parentId Int?
  headId Int?
  budget Decimal?
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  
  @@index([parentId])
  @@index([unitType])
}
```

### Program Hierarchy Models (Enhanced):

```prisma
model Program {
  id Int @id @default(autoincrement())
  code String @unique
  name String
  description String?
  strategicObjective String?
  ownerId Int
  ownerUnitId Int?
  status String @default("PLANNING") // PLANNING, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED
  priority String @default("MEDIUM") // CRITICAL, HIGH, MEDIUM, LOW
  budgetIdr Decimal?
  budgetSpent Decimal? @default(0)
  startDate DateTime
  targetEndDate DateTime
  actualEndDate DateTime?
  progressPercent Int? @default(0)
  
  // 8-Dimensi Fields
  strategicAlignment Float? // 0-100
  riskScore Float? // 0-100
  healthStatus String? // GREEN, YELLOW, RED
  
  // Linked Channel (NEW)
  linkedChannelId Int? // program discussions happen in this channel
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  initiatives Initiative[]
  kpis KpiDefinition[]
  tags ProgramTag[]
  comments Comment[]
  activities ActivityLog[]
  risks RiskIndicator[]
  
  @@index([ownerId])
  @@index([status])
  @@index([startDate])
  @@index([healthStatus])
}

model Initiative {
  id Int @id @default(autoincrement())
  code String @unique
  programId Int
  name String
  description String?
  ownerId Int
  ownerUnitId Int?
  status String @default("BACKLOG") // BACKLOG, READY, IN_PROGRESS, BLOCKED, IN_REVIEW, COMPLETED
  priority String @default("MEDIUM")
  
  startDate DateTime?
  targetCompletion DateTime
  actualCompletion DateTime?
  progressPercent Int? @default(0)
  
  milestones Json? // array of {name, date, completed}
  
  // 8-Dimensi Fields
  healthStatus String? // GREEN, YELLOW, RED
  riskLevel String? // LOW, MEDIUM, HIGH
  
  // Linked Channel (NEW)
  linkedChannelId Int?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  program Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  workItems WorkItem[]
  comments Comment[]
  activities ActivityLog[]
  tags InitiativeTag[]
  
  @@index([programId])
  @@index([ownerId])
  @@index([status])
  @@index([targetCompletion])
}

model WorkItem {
  id Int @id @default(autoincrement())
  code String @unique
  initiativeId Int
  title String
  description String?
  
  assignedTo Int?
  createdBy Int
  createdByUnitId Int?
  
  status String @default("BACKLOG") // BACKLOG, READY, IN_PROGRESS, BLOCKED, IN_REVIEW, COMPLETED
  priority String @default("MEDIUM") // CRITICAL, HIGH, MEDIUM, LOW
  percentComplete Int @default(0)
  
  startDate DateTime?
  targetCompletion DateTime
  actualCompletion DateTime?
  
  dependsOnIds Json? // array of work item IDs
  
  estimatedHours Float?
  actualHours Float? @default(0)
  
  // 8-Dimensi Fields
  healthStatus String? // GREEN, YELLOW, RED
  isBlocked Boolean @default(false)
  blockedReason String?
  
  // Linked Channel/Thread (NEW)
  linkedThreadId Int? // primary discussion thread
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  initiative Initiative @relation(fields: [initiativeId], references: [id], onDelete: Cascade)
  subTasks SubTask[]
  blockers Blocker[]
  comments Comment[]
  activities ActivityLog[]
  tags WorkItemTag[]
  
  @@index([initiativeId])
  @@index([assignedTo])
  @@index([status])
  @@index([targetCompletion])
  @@index([healthStatus])
  @@index([isBlocked])
}

model SubTask {
  id Int @id @default(autoincrement())
  workItemId Int
  title String
  description String?
  assignedTo Int?
  status String @default("PENDING") // PENDING, IN_PROGRESS, COMPLETED
  isCompleted Boolean @default(false)
  completedAt DateTime?
  dueDate DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  workItem WorkItem @relation(fields: [workItemId], references: [id], onDelete: Cascade)
  
  @@index([workItemId])
  @@index([assignedTo])
}
```

### NEW: Slack-Inspired Channels & Messaging Models:

```prisma
// CHANNELS SYSTEM (Core of collaboration)
model Channel {
  id Int @id @default(autoincrement())
  code String @unique
  name String
  description String?
  type String // PUBLIC, PRIVATE
  
  // Organization
  createdBy Int
  ownerUnitId Int?
  
  // Topics & Linking
  topicType String? // PROGRAM, INITIATIVE, TEAM, GENERAL, TOPIC
  linkedProgramId Int? // if channel is for a specific program
  linkedInitiativeId Int? // if channel is for a specific initiative
  
  // Settings
  isArchived Boolean @default(false)
  allowedPostTypes String? // all by default
  allowThreads Boolean @default(true)
  allowReactions Boolean @default(true)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  members ChannelMember[]
  messages ChannelMessage[]
  pinnedMessages ChannelMessage[]
  
  @@index([topicType])
  @@index([type])
  @@index([isArchived])
}

// Channel membership tracking (for permissions)
model ChannelMember {
  channelId Int
  userId Int
  joinedAt DateTime @default(now())
  lastViewedAt DateTime?
  isMuted Boolean @default(false)
  
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  
  @@id([channelId, userId])
  @@index([lastViewedAt])
}

// Messages in channels (with threading support)
model ChannelMessage {
  id Int @id @default(autoincrement())
  channelId Int
  userId Int
  content String
  
  // Rich text & attachments (NEW)
  richContent Json? // markdown or block format: {blocks: [], entities: []}
  attachments Json? // array of {url, type, name}
  
  // Threading (CRITICAL - Slack-style)
  parentMessageId Int? // if this is a reply, reference parent
  replyCount Int @default(0) // how many replies on this thread
  
  // Reactions (NEW)
  reactions Json? // {":thumbsup:": [userId1, userId2], ":heart:": [userId3]}
  
  // Metadata
  isPinned Boolean @default(false)
  isEdited Boolean @default(false)
  editedAt DateTime?
  editedBy Int?
  
  // Search optimization (NEW)
  searchableText String? // de-normalized for full-text search
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  author User @relation(fields: [userId], references: [id], name: "MessageAuthor")
  parentMessage ChannelMessage? @relation("ThreadReplies", fields: [parentMessageId], references: [id])
  replies ChannelMessage[] @relation("ThreadReplies")
  
  @@index([channelId])
  @@index([userId])
  @@index([parentMessageId])
  @@index([isPinned])
  @@index([createdAt])
}

// USER PRESENCE & STATUS (NEW - Real-time collaboration)
model UserStatus {
  id Int @id @default(autoincrement())
  userId Int @unique
  status String // ONLINE, AWAY, DO_NOT_DISTURB, OFFLINE
  statusEmoji String? // :calendar:, :coffee:, :phone:, etc
  statusMessage String? // "In a meeting", "Lunch"
  lastActivityAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// ENHANCED COMMENTS (with threading & reactions)
model Comment {
  id Int @id @default(autoincrement())
  entityType String // PROGRAM, INITIATIVE, WORK_ITEM, BLOCKER
  entityId Int
  commentText String
  createdBy Int
  
  // Threading (NEW)
  parentCommentId Int?
  replyCount Int @default(0)
  
  // Rich text & attachments (NEW)
  richContent Json? // markdown or block format
  attachments Json? // file URLs
  
  // Reactions (NEW)
  reactions Json? // emoji reactions object
  
  // Mentions (ENHANCED)
  mentionedUserIds Json? // array of @mentioned user IDs
  mentionChannels Json? // array of @channel tags
  
  // Metadata
  isPinned Boolean @default(false)
  isEdited Boolean @default(false)
  editedAt DateTime?
  searchableText String? // for full-text search
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  parentComment Comment? @relation("CommentReplies", fields: [parentCommentId], references: [id])
  replies Comment[] @relation("CommentReplies")
  
  @@index([entityType, entityId])
  @@index([createdBy])
  @@index([isPinned])
  @@index([parentCommentId])
}

// FULL-TEXT SEARCH INDEX (NEW)
model SearchableContent {
  id Int @id @default(autoincrement())
  contentType String // CHANNEL_MESSAGE, COMMENT, PROGRAM, INITIATIVE, WORK_ITEM
  contentId Int
  channelId Int? // for channel messages
  
  title String?
  content String
  author String? // author name
  authorId Int?
  
  tags Json? // array of tags for filtering
  createdAt DateTime
  updatedAt DateTime
  
  @@index([contentType])
  @@index([authorId])
  @@index([createdAt])
  @@fulltext([content]) // MySQL full-text index
}

// SAVED SEARCHES (NEW)
model SavedSearch {
  id Int @id @default(autoincrement())
  userId Int
  name String
  description String?
  searchQuery String // full search query
  filters Json? // {status: 'In Progress', assignee: 123, channel: 'program-xyz'}
  searchType String // ALL, CHANNEL_MESSAGES, COMMENTS, WORK_ITEMS
  isShared Boolean @default(false)
  createdAt DateTime @default(now())
  
  @@index([userId])
  @@index([isShared])
}
```

### KPI & Metrics Models:

```prisma
model KpiDefinition {
  id Int @id @default(autoincrement())
  code String @unique
  programId Int?
  initiativeId Int?
  name String
  description String?
  metricType String // REVENUE, COST, PRODUCTIVITY, QUALITY, RISK, CUSTOM
  dataType String // NUMERIC, PERCENTAGE, CURRENCY
  
  targetValue Decimal
  actualValue Decimal?
  warningThreshold Decimal?
  criticalThreshold Decimal?
  unitOfMeasure String?
  
  reviewFrequency String @default("MONTHLY")
  lastMeasuredDate DateTime?
  
  ownerId Int?
  ownerUnitId Int?
  
  isLeadingIndicator Boolean @default(false)
  leadingIndicatorFor String?
  
  isActive Boolean @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  kpiValues KpiValue[]
  
  @@index([programId])
  @@index([metricType])
  @@index([isLeadingIndicator])
}

model KpiValue {
  id Int @id @default(autoincrement())
  kpiDefinitionId Int
  measurementDate DateTime
  targetValue Decimal?
  actualValue Decimal
  status String? // GREEN, YELLOW, RED
  variance Decimal?
  variancePercent Float?
  statusNotes String?
  measuredBy Int?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  kpiDefinition KpiDefinition @relation(fields: [kpiDefinitionId], references: [id], onDelete: Cascade)
  
  @@unique([kpiDefinitionId, measurementDate])
  @@index([kpiDefinitionId])
  @@index([measurementDate])
  @@index([status])
}
```

### Risk & Blocker Models:

```prisma
model RiskIndicator {
  id Int @id @default(autoincrement())
  code String @unique
  programId Int
  name String
  description String?
  riskCategory String // BUSINESS, OPERATIONAL, FINANCIAL, STRATEGIC
  
  probabilityScore Int? // 1-5
  impactScore Int? // 1-5
  riskScore Float? // probability × impact
  riskLevel String? // LOW, MEDIUM, HIGH
  
  acceptableThreshold Float?
  currentStatus String @default("OPEN")
  
  mitigationActions String?
  mitigationOwner Int?
  mitigationDeadline DateTime?
  
  ownerId Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  program Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  activities ActivityLog[]
  
  @@index([programId])
  @@index([riskCategory])
  @@index([riskLevel])
  @@index([currentStatus])
}

model Blocker {
  id Int @id @default(autoincrement())
  code String @unique
  workItemId Int
  title String
  description String?
  severity String // CRITICAL, HIGH, MEDIUM, LOW
  
  createdBy Int
  createdByUnitId Int?
  assignedTo Int?
  
  status String @default("OPEN") // OPEN, IN_PROGRESS, RESOLVED
  priority String @default("HIGH")
  
  rootCause String?
  resolution String?
  resolvedAt DateTime?
  resolutionTime Int?
  
  relatedBlockerIds Json?
  linkedWorkItemIds Json?
  
  // Discussion channel (NEW)
  linkedChannelId Int? // dedicated channel for blocker discussion
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  workItem WorkItem @relation(fields: [workItemId], references: [id], onDelete: Cascade)
  comments Comment[]
  activities ActivityLog[]
  
  @@index([workItemId])
  @@index([assignedTo])
  @@index([status])
  @@index([severity])
}
```

### Activity & Tagging Models:

```prisma
model ActivityLog {
  id Int @id @default(autoincrement())
  entityType String // PROGRAM, INITIATIVE, WORK_ITEM, BLOCKER, KPI
  entityId Int
  action String // CREATED, UPDATED, STATUS_CHANGED, COMMENTED, REACTION_ADDED, etc
  changedBy Int
  changedByUnitId Int?
  changeTimestamp DateTime @default(now())
  
  fieldChanged String?
  oldValues Json?
  newValues Json?
  description String?
  
  createdAt DateTime @default(now())
  
  @@index([entityType, entityId])
  @@index([changedBy])
  @@index([changeTimestamp])
  @@index([action])
}

model Tag {
  id Int @id @default(autoincrement())
  name String @unique
  color String?
  description String?
  createdAt DateTime @default(now())
}

model ProgramTag {
  programId Int
  tagId Int
  createdAt DateTime @default(now())
  @@id([programId, tagId])
}

model InitiativeTag {
  initiativeId Int
  tagId Int
  createdAt DateTime @default(now())
  @@id([initiativeId, tagId])
}

model WorkItemTag {
  workItemId Int
  tagId Int
  createdAt DateTime @default(now())
  @@id([workItemId, tagId])
}
```

### Notification & Preferences:

```prisma
model NotificationPreference {
  id Int @id @default(autoincrement())
  userId Int
  notificationType String // STATUS_CHANGE, MENTION, REACTION, MESSAGE, DUE_DATE, etc
  channel String // EMAIL, IN_APP, SLACK, SMS
  enabled Boolean @default(true)
  frequency String // IMMEDIATE, DAILY_DIGEST, WEEKLY_DIGEST
  createdAt DateTime @default(now())
  
  @@unique([userId, notificationType, channel])
}
```

---

## PART 2: Backend API Endpoints (Express - COMPREHENSIVE v3)

### CHANNELS API (NEW - Slack-Inspired):

File: backend/src/routes/channels.ts
Endpoints:
- GET /api/channels (list all channels user has access to)
  Response: {data: [{id, name, type, memberCount, unreadCount, lastMessage}], total}
- GET /api/channels/:id (detail + members)
- POST /api/channels (create channel)
  Input: {name, description, type: PUBLIC|PRIVATE, topicType?, linkedProgramId?}
- PUT /api/channels/:id (update)
- DELETE /api/channels/:id (archive)
- POST /api/channels/:id/members (add member)
- DELETE /api/channels/:id/members/:userId (remove member)
- GET /api/channels/:id/members (list members)
- PUT /api/channels/:id/members/:userId/mute (mute channel for user)

### CHANNEL MESSAGES API (NEW - Threading & Reactions):

File: backend/src/routes/channel-messages.ts
Endpoints:
- GET /api/channels/:channelId/messages (list messages, paginated)
  Query params: limit=20, offset=0, includeThreads=true
  Response: messages with replyCount, reactions, author info
  
- POST /api/channels/:channelId/messages (post message)
  Input: {content, richContent?, attachments?, mentions?, parentMessageId?}
  Auto-detect mentions and create activity log
  
- PUT /api/channels/:channelId/messages/:messageId (edit message)
  Input: {content, richContent?, attachments?}
  
- DELETE /api/channels/:channelId/messages/:messageId (delete message)

- GET /api/channels/:channelId/messages/:messageId/thread (get thread replies)
  Response: parentMessage + all replies (nested tree)
  
- POST /api/channels/:channelId/messages/:messageId/reactions (add emoji reaction)
  Input: {emoji: ":thumbsup:"}
  Auto-update reactions object
  
- DELETE /api/channels/:channelId/messages/:messageId/reactions/:emoji (remove reaction)

- PUT /api/channels/:channelId/messages/:messageId/pin (pin message)

### SEARCH API (NEW - Full-text + Filters):

File: backend/src/routes/search.ts
Endpoints:
- GET /api/search (full-text search)
  Query params:
    - q: search query (required)
    - type: CHANNEL_MESSAGES|COMMENTS|WORK_ITEMS|ALL (default: ALL)
    - from: userId (who posted it)
    - in: channelId (search in specific channel)
    - during: dateRange (from-to dates)
    - status: work item status filter
    - priority: priority filter
  Response: {results: [{type, id, title, snippet, author, createdAt}], total}
  
- GET /api/search/saved (list user's saved searches)
- POST /api/search/saved (save search)
- DELETE /api/search/saved/:searchId

### USER PRESENCE API (NEW):

File: backend/src/routes/presence.ts
Endpoints:
- GET /api/users/presence (get all online users in org)
  Response: {users: [{id, name, status, statusEmoji, statusMessage, lastSeenAt}]}
  
- GET /api/users/:id/status (get user status)
- PUT /api/users/me/status (update own status)
  Input: {status: ONLINE|AWAY|DND|OFFLINE, statusEmoji?, statusMessage?}
  
- GET /api/channels/:channelId/presence (who's active in channel)

### ENHANCED COMMENTS API (with threading):

File: backend/src/routes/comments.ts (UPDATED)
Endpoints:
- GET /api/{entity-type}/{id}/comments (list comments, flat or threaded)
  Query params: threaded=true|false, parentOnly=true (show only top-level)
  
- POST /api/{entity-type}/{id}/comments (create comment)
  Input: {commentText, richContent?, attachments?, mentions?, parentCommentId?}
  
- GET /api/comments/:commentId/thread (get specific thread + replies)
  Response: {parentComment, replies: [{...}, {...}]}
  
- PUT /api/comments/:commentId (edit)
- DELETE /api/comments/:commentId

- POST /api/comments/:commentId/reactions (add emoji)
  Input: {emoji: ":thumbsup:"}
  
- DELETE /api/comments/:commentId/reactions/:emoji

- PUT /api/comments/:commentId/pin (pin important comment)

### CORE ENDPOINTS (Programs, Initiatives, WorkItems - with messaging links):

File: backend/src/routes/programs.ts
- GET /api/programs (list with channel info)
  Response includes: linkedChannelId, activityCount, messageCount
- GET /api/programs/:id
- POST /api/programs (create + auto-create associated channel if specified)
- PUT /api/programs/:id
- DELETE /api/programs/:id
- GET /api/programs/:id/timeline
- GET /api/programs/:id/health
- GET /api/programs/:id/messages (activity + messages in linked channel)

File: backend/src/routes/initiatives.ts
Similar pattern as programs
- Includes linkedChannelId in responses
- GET /api/initiatives/:id/discussions (get all channel messages + comments)

File: backend/src/routes/workitems.ts
- GET /api/work-items (Kanban data)
- GET /api/work-items/:id (detail + linkedThreadId)
- POST /api/work-items/:id/subtasks
- PUT /api/work-items/:id/status
- PUT /api/work-items/:id/progress
- GET /api/work-items/:id/discussions (all comments + channel thread)

File: backend/src/routes/kpis.ts
- GET /api/kpis
- GET /api/kpis/:id (with historical trend)
- POST /api/kpis/:id/values (record measurement)
- GET /api/kpis/leading-indicators

File: backend/src/routes/blockers.ts
- GET /api/blockers
- POST /api/blockers
- PUT /api/blockers/:id/status
- GET /api/blockers/:id/channel (get dedicated discussion channel)

### DASHBOARD API (8-Dimensi - UNCHANGED but enhanced with messaging):

File: backend/src/routes/dashboard.ts
- GET /api/dashboard (returns all dimensi data + recent channel activity)
- GET /api/dashboard/dimensi-1-strategic
- GET /api/dashboard/dimensi-2-programs
- GET /api/dashboard/dimensi-3-leading-indicators
- GET /api/dashboard/dimensi-4-time-intelligence
- GET /api/dashboard/dimensi-6-risk (with notification count)
- GET /api/dashboard/dimensi-7-accountability
- GET /api/dashboard/dimensi-8-governance
- GET /api/dashboard/dimensi-9-performance
- GET /api/dashboard/dimensi-10-collaboration (activity + mentions + reactions)
- GET /api/dashboard/health-status

### NOTIFICATION API (NEW):

File: backend/src/routes/notifications.ts
Endpoints:
- GET /api/notifications (get pending notifications for current user)
  Query params: limit=20, offset=0, read=false|true|all
  Response: {notifications: [{type, message, source, createdAt, read}], unreadCount}
  
- PUT /api/notifications/:id/read (mark as read)
- PUT /api/notifications/read-all (mark all as read)
- PUT /api/users/me/notification-preferences (update preferences)

## For ALL endpoints:
- Include Zod validation
- Proper error handling (400, 404, 500)
- Full TypeScript types
- Logging middleware
- Auth checks
- Auto-calculate dependent fields
- Pagination (default 20, max 100)
- Sorting & filtering
- Include counts/summaries

## AUTO-CALCULATIONS (Critical):

Server-side calculations (auto-trigger):
- Program.progressPercent = avg of initiatives
- Initiative.progressPercent = avg of workItems
- WorkItem.healthStatus = based on progress%, blocked, overdue
- KPI.status = based on actualValue vs thresholds
- RiskIndicator.riskScore = probability × impact
- ChannelMessage.searchableText = content + attachments for search
- ActivityLog on every mutation (with change details)
- Unread count per channel (based on lastViewedAt)

## WEBSOCKET EVENTS (Real-time - Phase 2):

Optional for MVP, but structure for future:
- channel:message-posted
- channel:reaction-added
- user:status-changed
- work-item:status-changed
- comment:created
- blocker:created

---

## PART 3: Frontend Pages & Components (React - COMPREHENSIVE v3)

### PRIMARY PAGES:

Page 1: Main Dashboard (8-Dimensi + Recent Activity)
- 10 dimensi tabs (as before)
- PLUS: Recent channel activity widget
- PLUS: Mentions & reactions on my posts
- PLUS: Who's online widget
- Real-time feel (auto-refresh every 5 min)

Page 2: Channels Sidebar + View (NEW - PRIMARY UX)
- Left sidebar: list of channels
  * Unread count badge
  * Starred channels (pin favorites)
  * Search channels
  * Create channel button
  
- Main area: channel view
  * Channel header (name, description, members)
  * Messages list (grouped by date)
  * Threading support (click to expand thread)
  * Message composer (rich text editor)
  * Member list (right sidebar)

Page 3: Channel Message View (NEW - Detailed)
- Single thread view
- Parent message + all replies
- Reactions on each message
- @mentions highlighting
- Rich text rendering
- File previews

Page 4: Programs Dashboard (Monday.com-style - UNCHANGED)
- Table view
- Timeline/Gantt view
- Filter, sort, bulk actions
- Inline editing
- Channel link indicator

Page 5: Initiatives & WorkItems Kanban (UNCHANGED)
- Drag-drop status change
- Card shows linked channel icon
- Click to open detail modal

Page 6: Work Item Detail Modal (ENHANCED)
- All original fields
- PLUS: Linked discussion thread (if exists)
- PLUS: Comments with threading & reactions
- PLUS: Activity log with all changes

Page 7: KPI Dashboard (UNCHANGED)
- KPI cards with sparklines
- Click for detail

Page 8: Risk Dashboard (UNCHANGED)
- Risk matrix visualization
- Filter by risk level

Page 9: Blocker Tracker (ENHANCED)
- List of blockers
- PLUS: Click to view dedicated discussion channel
- PLUS: Reaction count on blocker

Page 10: Activity Feed (ENHANCED)
- Timeline of activities + channel messages
- Filter by: action, user, entity, date
- Full-text search integration
- @mentions highlighting

Page 11: Search Results (NEW)
- Full-text search UI
- Filter panel (from, in, type, during)
- Results grouped by type
- Link to original location

Page 12: Presence Panel (NEW)
- Who's online now
- Status with custom message
- Last seen timestamp

### COMPONENTS (All updated to support Slack features):

Existing components enhanced:
1. StatusBadge - unchanged
2. ProgressBar - unchanged
3. UserAvatar - PLUS: online status indicator
4. HealthIndicator - unchanged
5. PriorityBadge - unchanged
6. DateRange - unchanged
7. FilterPanel - ENHANCED for search filters
8. PaginationControl - unchanged
9. ConfirmDialog - unchanged
10. KPICard - unchanged
11. WorkItemCard - unchanged

NEW components:
1. ChannelList - list channels with unread badges
2. ChannelMessage - render message with reactions & threading
3. MessageComposer - rich text editor for posting
4. ThreadView - thread display with replies
5. EmojiReactionPicker - emoji selector for reactions
6. ReactionDisplay - show who reacted with what emoji
7. RichTextEditor - markdown/block-based editor
8. MentionSelector - @ mention autocomplete (users & channels)
9. FileUpload - drag-drop file attachment
10. SearchBox - search with autocomplete suggestions
11. PresenceIndicator - online status dot + custom status
12. ChannelHeader - channel info + member list
13. Threaded CommentList - comments with replies
14. SearchFilters - advanced search filter panel
15. SavedSearchList - list of user's saved searches
16. NotificationBadge - notification count
17. ActivityStream - chronological activity + messages

## PART 4: Real-Time & Notifications

WebSocket Integration (Optional Phase 2, but design for it):
- Real-time message delivery
- Activity updates
- Presence broadcasts (who's typing, who's online)
- Notification delivery

Email Notifications:
- Message mention: "User X mentioned you in #program-xyz"
- Status change: "Your work item status changed to Completed"
- Blocker assigned: "You are assigned to blocker XYZ"
- Daily digest: Summary of mentions, comments, status changes

## PART 5: Search & Discovery

Full-Text Search Features:
- Search across: channel messages, comments, work item titles, KPI names
- Search filters:
  * from:@username (posted by user)
  * in:#channel-name (in specific channel)
  * type:work-item (filter by entity type)
  * during:2024-03-01..2024-03-31 (date range)
  * status:In Progress (work item status)
  * priority:Critical (item priority)
  
- Saved searches (name query + filters, mark as shared)
- Search suggestions (recent searches, popular searches)

Implementation:
- Backend: Full-text index on MySQL (FULLTEXT search)
- Frontend: Search page with filter sidebar
- Results: grouped by type, link to original

## PART 6: Styling & UX

Design System (TailwindCSS):
- Color palette: PTPN corporate colors
- Status colors: GREEN (#10B981), YELLOW (#F59E0B), RED (#EF4444)
- Component library: consistent buttons, inputs, modals
- Dark mode: toggle support
- Responsive: mobile-first
- Accessibility: WCAG 2.1 AA

## PART 7: Critical Requirements

1. Full TypeScript strict mode ✓
2. Zod validation for all inputs ✓
3. Comprehensive error handling ✓
4. Comments in all complex logic ✓
5. Realistic sample data (5+ programs, 10+ initiatives, 20+ work items) ✓
6. All auto-calculations working ✓
7. Health status auto-calculated ✓
8. Risk scores auto-calculated ✓
9. Threading system fully functional ✓
10. Emoji reactions working ✓
11. Full-text search indexed ✓
12. User presence tracking ✓
13. Audit trail complete ✓
14. Governance controls in place ✓

## PART 8: Generation Sequence

PHASE 1 (Core - 3 weeks):
1. Database schema (Prisma) complete
2. Channels + Messages endpoints
3. Comments + Activity endpoints
4. Dashboard endpoints (all dimensi)
5. CRUD endpoints (programs, initiatives, workitems, KPI)
6. Dashboard page (all dimensi)
7. Channels page (sidebar + messages)
8. Programs/Initiatives/Kanban views
9. KPI/Risk/Blocker pages
10. Reusable components
11. Styling & polish

PHASE 2 (Enhancement - 2 weeks):
1. Full-text search (backend index + frontend UI)
2. Advanced filters & saved searches
3. User presence & status system
4. Enhanced notifications
5. Rich text editor
6. Emoji reactions
7. Threading refinement
8. Activity feed enhancements
9. Search page
10. Final polish & performance optimization

## DELIVERABLES

This generates a COMPLETE, PRODUCTION-READY enterprise platform that is:

✓ Slack-level collaboration (channels, threading, reactions, presence)
✓ Monday.com-level management (visual, automation, customization)
✓ Jira-level tracking (workflows, blockers, audit trail)
✓ PTPN 8-dimensi dashboard fully integrated
✓ Full TypeScript, type-safe throughout
✓ Database schema normalized & optimized
✓ 70+ API endpoints, all documented
✓ 12+ frontend pages, fully functional
✓ 20+ reusable components
✓ Real-time collaboration features
✓ Full search & discovery
✓ Professional UI/UX
✓ Governance & compliance controls
✓ Ready for 50-100 users
✓ Ready for MAMP network deployment
✓ Production-grade code quality

This is NOT a template or boilerplate.
This is a COMPLETE WORKING APPLICATION ready for real usage.

Generate ALL code with:
- Complete imports
- All type definitions
- All error handling
- All validation
- Comprehensive comments
- Sample/seed data
- Connection to all systems
```

---

## PENTING: READ INI SEBELUM PASTE

Prompt ini **SANGAT COMPREHENSIVE**. Akan generate ribuan lines kode. Claude Code akan:

1. **Create/update files dalam backend:**
   - `prisma/schema.prisma` (complete schema)
   - `src/routes/*.ts` (all API endpoints)
   - `src/services/` (business logic)
   - `.env.example` (config template)

2. **Create/update files dalam frontend:**
   - `src/pages/*.tsx` (all pages)
   - `src/components/*.tsx` (all components)
   - `src/services/api.ts` (API integration)
   - `src/hooks/` (custom hooks)
   - `src/styles/` (Tailwind config)

3. **Update root files:**
   - `package.json` (dependencies)
   - Database migration prep

**TIMELINE:**
- Generation: 40-50 menit
- Integration: 30 menit
- Testing: 1-2 jam
- Total: 2-3 jam siap running!

---
