# School Portal UI Plan — Per-Institution Access

## Overview

Each institution (school/university) gets their own scoped experience inside the same application.
No separate deployment needed — the same frontend adapts based on the logged-in user's role and tenant.

---

## User Roles (Updated)

| Role | Who | Access |
|---|---|---|
| **Super Admin** | Platform owner (you) | Everything — all tenants, global settings, billing |
| **Institution Admin** | School's IT manager or principal | Their school's documents, users, analytics only |
| **Student / Client** | Students and teachers | Chat interface scoped to their school's knowledge base |

---

## What Each Role Sees

### Super Admin (you)
- Everything that exists today, plus:
- **Institutions dashboard** — list all schools, create new ones, assign admins
- **Global analytics** — usage across all schools
- **Billing overview** — questions per school per month (for invoicing)
- Can impersonate any institution to debug issues

### Institution Admin (school's IT person)
- **Their own document library** — upload, manage, delete only their school's documents
- **Their own user management** — invite students and teachers, approve registrations
- **Their own analytics** — questions asked, topics trending, knowledge gaps
- **AI provider settings** — which provider to use (if you allow per-tenant override)
- Cannot see other schools' data at all

### Student / Client
- **Chat interface** — identical to today but answers come only from their school's documents
- **Search** — searches only within their school's knowledge base
- Cannot see documents from other schools

---

## Frontend Changes Required

### 1. Login Flow
- Login page stays the same
- After login, the app reads the user's `tenantId` and `role` from the API
- Super Admin → routed to global admin panel (current behaviour)
- Institution Admin → routed to institution admin panel (scoped)
- Student → routed to chat interface (scoped to their tenant)

### 2. New Pages / Routes

#### Super Admin additions
| Route | Page | Description |
|---|---|---|
| `/admin/institutions` | Institutions List | Table of all schools with user/doc/question counts |
| `/admin/institutions/new` | Create Institution | Form: name, slug, assign first admin |
| `/admin/institutions/:id` | Institution Detail | Drill into a school — users, docs, usage stats |

#### Institution Admin panel (replaces current admin panel for this role)
| Route | Page | Description |
|---|---|---|
| `/school/dashboard` | Dashboard | Key stats: documents, active users, questions today |
| `/school/documents` | Document Library | Upload/manage their own documents only |
| `/school/users` | User Management | Invite, approve, deactivate their students/teachers |
| `/school/analytics` | Analytics | Question trends, knowledge gaps, top topics |
| `/school/settings` | Settings | School name, logo (future), AI provider preference |

#### Student interface
- `/chat` — same as today, but answers are tenant-scoped (no frontend changes needed here, backend already handles it after Phase 1)

### 3. Navbar / Sidebar changes
- Show school name and logo in the sidebar header for institution users
- Super Admin sees "Platform Admin" label
- Institution Admin sees their school's name
- Student sees their school's name

### 4. Document Upload (Institution Admin)
- When an institution admin uploads a document, the backend automatically tags it with their `tenantId`
- No extra UI step needed — the tenantId comes from the logged-in user's account

### 5. User Invite Flow (Institution Admin)
- Institution admin can invite users by email
- Invited users are automatically assigned to the same `tenantId`
- Approval flow same as today (admin approves pending registrations)

---

## Backend Changes Required (for this plan)

These are in addition to Phase 1 which is already done.

### 1. Document upload endpoint
- Read the uploader's `tenantId` from their user record
- Automatically set `document.tenantId` on upload
- Institution admins can only list/delete documents where `tenantId` matches theirs

### 2. User management endpoint
- Institution admins can only list/approve/deactivate users where `tenantId` matches theirs
- Creating a user via institution admin automatically assigns the same `tenantId`

### 3. Analytics endpoint
- Existing `/admin/question-analytics` needs a tenant filter
- Returns only that institution's data when called by an institution admin

### 4. Auth — add tenantId + role to login response
- Login response should include `tenantId` (null for super admin)
- Frontend uses this to decide which panel to render
- No need to change JWT for now — frontend fetches user profile on load

### 5. Permission middleware
- New middleware `requireSameTenant` — institution admins cannot touch resources from other tenants
- Super admin bypasses all tenant checks

---

## Implementation Order (when we get to this)

1. **Backend first**
   - [ ] Middleware: `requireSameTenant` — block cross-tenant access for institution admins
   - [ ] Document routes — auto-tag with uploader's tenantId, filter list by tenant
   - [ ] User routes — scope create/list/approve to institution admin's tenant
   - [ ] Analytics route — add tenant filter
   - [ ] Login response — include tenantId in user profile endpoint

2. **Frontend**
   - [ ] Auth context — store tenantId + role, drive routing decisions
   - [ ] Institution Admin panel — scoped dashboard, documents, users, analytics
   - [ ] Super Admin additions — institutions list, create institution, institution detail
   - [ ] Sidebar — show school name for institution users

---

## What Stays the Same
- Login page — no change
- Student chat interface — no visible change (backend already scopes it via Phase 1)
- AI provider logic — no change
- WhatsApp integration — will be scoped per-tenant when we get to Phase 4

---

## Summary

| Thing | Now | After this plan |
|---|---|---|
| Admin panel | One global panel (you only) | Super Admin panel + per-school Institution Admin panel |
| Document uploads | All docs are global | Each school's docs are isolated |
| Chat answers | From all documents | From the student's school's documents only |
| User management | You manage everyone | Each school manages their own users |
| Analytics | Global | Per-school for institution admins, global for you |
