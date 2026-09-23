# ZRP Smart Traffic Project — Codex Instructions

> **Purpose:** Build a demonstrable, locally runnable university prototype of a Zimbabwe Republic Police (ZRP) smart traffic management system. This is a **student prototype, not an official ZRP system**. Use fictional records and a clearly labelled demo environment. Do not imply endorsement by or access to ZRP, ZINARA, CVR, or any other government body.

## 1. What Codex must deliver

Develop a full-stack application with:

1. **Officer mobile app:** authenticated officer workflow for manual vehicle lookup, recording traffic offences, attaching evidence, recording incidents, and issuing *demo* digital tickets.
2. **Command-centre web dashboard:** manage demo incidents, offences, officers, checkpoints, and view maps, status updates, and basic analytics.
3. **Public web portal (later phase):** search a demo ticket using an unguessable reference plus a secondary verification factor; view its details and payment *simulation* status.
4. **Central backend and database:** secure API, role-based access, consistent audit trail, validation, and locally stored demo data.

**Primary MVP demonstration:** Officer signs in → enters a plate manually → reviews matching fictional vehicle → records a fictional offence and optional evidence → creates a demo ticket → dashboard displays it → supervisor can review it.

The system must be usable end-to-end before adding advanced features. Build an actual working application, not just static screens or a conceptual diagram.

## 2. Stack and cost constraints

Use free/open-source components and local development by default:

| Layer | Choice |
| --- | --- |
| Officer mobile app | Flutter (Dart), Android-first |
| Dashboard and public portal | React + TypeScript + Vite |
| Backend | Node.js + NestJS + TypeScript |
| Database | PostgreSQL with Prisma ORM |
| API documentation | NestJS Swagger / OpenAPI |
| Maps | OpenStreetMap with Leaflet on web; Flutter-compatible OSM map package on mobile |
| Live updates | WebSockets or server-sent events, with polling fallback |
| Authentication | Server-managed sessions or short-lived JWT access tokens with safe refresh handling |
| File storage | Local private development storage behind authenticated API |
| Local services | Docker Compose for PostgreSQL; allow app processes to run directly on host |
| Tests | Jest (API), Vitest + React Testing Library (web), Flutter test |

No paid API keys, cloud subscription, SMS service, payment gateway, or production government-data integration is required for the MVP. Do not assume an OSM tile server provides unlimited free production traffic. Use demo data for congestion overlays and respect tile-provider usage policies and attribution. Avoid mandatory Google Maps, Firebase, or commercial OCR dependencies.

## 3. Repository structure

Create this layout, adapting only if a documented technical reason requires it:

```text
zrp-smart-traffic/
├── AGENTS.md                    # This file
├── README.md                    # Setup, architecture, demo accounts, limitations
├── .env.example                 # Safe placeholders only
├── .gitignore
├── docker-compose.yml           # PostgreSQL for development
├── docs/
│   ├── 01-project-overview.md
│   ├── 02-requirements.md
│   ├── 03-architecture.md
│   ├── 04-testing-and-evaluation.md
│   ├── api.md
│   └── decisions.md
├── apps/
│   ├── api/                     # NestJS + Prisma
│   ├── dashboard/               # React command centre and later public portal
│   └── officer-mobile/          # Flutter
├── packages/
│   └── contracts/               # Optional shared API types and schema
└── scripts/                     # Seed/reset helpers using fictional data
```

If the repository already contains useful implementation or documentation, **inspect it first and preserve existing work**. Do not overwrite user-approved wording or delete files to satisfy this example layout. Work incrementally and explain material deviations.

## 4. Users, permissions, and boundaries

Implement least-privilege role-based access control **on the server**, not just by hiding UI controls.

| Role | Allowed demo actions |
| --- | --- |
| OFFICER | View authorised fictional vehicle records; create own draft offences, tickets and incidents; upload evidence; view own activity |
| SUPERVISOR | Review and update assigned offences/incidents; view operational dashboard and audit-relevant history |
| ADMIN | Manage demo user accounts, officer assignments, offence categories and system settings; view audit records |
| PUBLIC | Access only a specific verified demo ticket and general public notices, never officer/driver search endpoints |

Use explicit ownership and authorisation checks for record reads and writes. A user cannot obtain another officer's restricted records just by changing an ID in a URL. Do not expose a searchable public driver or vehicle registry. Separate authentication for staff and public ticket verification.

## 5. Functional requirements

### 5.1 Authentication
- Seed fictional demo accounts for each staff role; put setup instructions in README, not passwords in tracked source code.
- Hash passwords with a suitable password hashing algorithm (Argon2id preferred); never store plaintext credentials.
- Enforce authentication and roles on every protected API endpoint.
- Support logout, expiry and clear unauthorised/forbidden responses.
- Rate-limit login and ticket-verification attempts.

### 5.2 Officer mobile app
- Login and logout screens with clear current-user identity.
- Manual registration-number search using **seeded fictional records only**; show a clear `No matching demo record` state.
- Vehicle details page: plate, make/model, colour, demo registration status and minimal relevant fictional owner/driver info.
- Record offence: choose offence category, enter notes, associate vehicle, capture timestamp and optional GPS with permission, attach optional image.
- Preview and submit an offence; backend generates an immutable ticket reference and records who submitted it.
- Record a basic incident with type, location, description and status.
- Read own recent tickets and incidents.
- Show explicit loading, success, error, no-network and permission-denied states.
- **Offline support:** in the initial MVP, display an accurate offline state and prevent ambiguous duplicate submissions. Add an encrypted local draft/outbox and idempotent synchronisation only after the online workflow is stable.

### 5.3 Dashboard
- Protected login; responsive desktop-first design.
- Overview: counts of open incidents, submitted offences, active demo checkpoints and tickets by status.
- List/detail views with filtering, search and pagination for permitted offences and incidents.
- Supervisor review flow with documented status transitions.
- Map of **fictional** incidents/checkpoints; display OSM attribution.
- Basic trends over time derived from seeded or created records; label all seeded statistics as demo data.
- Admin pages for demo officer accounts and offence categories.
- Prefer reliable refresh/polling first; add live updates after CRUD and authorisation work.

### 5.4 Public portal — after the core MVP
- Allow access to an individual demo ticket through a non-sequential reference **and** a separate verification factor.
- Expose only limited ticket information; avoid showing personal identifiers or raw evidence publicly.
- Simulate payment transitions without taking real money or asserting that a fine has legally been settled.
- Clearly mark all tickets, amounts and receipts as `DEMO — NOT VALID FOR PAYMENT OR ENFORCEMENT`.

## 6. Proposed database entities

Model the following relationships with Prisma migrations and appropriate indices/constraints:

- `User`: id, name, email, role, passwordHash, active, createdAt, updatedAt.
- `OfficerProfile`: id, userId, fictional badgeNumber, stationName.
- `Driver`: id, fictional fullName, fictional licenceNumber, demo licenceStatus.
- `Vehicle`: id, fictional registrationNumber (normalised/unique), make, model, colour, demo registrationStatus, optional driverId.
- `OffenceCategory`: id, code, name, description, demoFineAmount, active.
- `Offence`: id, officerId, vehicleId, categoryId, location, latitude/longitude nullable, notes, observedAt, createdAt, status, review metadata.
- `Ticket`: id, offenceId (unique), random publicReference (unique), demoFineAmountSnapshot, status, issuedAt, optional verified paymentSimulation metadata.
- `Evidence`: id, offenceId or incidentId, privateStorageKey, mimeType, byteSize, sha256, uploadedBy, createdAt.
- `Incident`: id, reportedBy, type, description, location, optional coordinates, status, timestamps.
- `Checkpoint`: id, name, optional coordinates, startAt, endAt, status, createdBy.
- `AuditEvent`: id, actorId nullable, action, entityType, entityId, timestamp, safeMetadata.

Model enums and transition rules centrally. Validate date/time and coordinate ranges. Record authoritative timestamps on the backend. Avoid unnecessary personal information; use synthetic identities and fictional licence/registration numbers. The dashboard must not present seeded analytics as real Zimbabwe traffic statistics.

## 7. API design

Provide versioned REST routes under `/api/v1`; define and document request/response DTOs and validation:

```text
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me
GET    /vehicles?registration=...
GET    /vehicles/:id
GET    /offence-categories
POST   /offences
GET    /offences
GET    /offences/:id
POST   /offences/:id/evidence
POST   /offences/:id/submit
POST   /offences/:id/review
GET    /tickets/:id
GET    /incidents
POST   /incidents
PATCH  /incidents/:id
GET    /checkpoints
POST   /checkpoints
GET    /analytics/overview
GET    /audit-events                  # admin only
POST   /public/tickets/verify        # later phase; restricted response
```

Keep ticket generation inside a transaction with offence submission. Handle repeated requests idempotently: retries must not create multiple tickets for one offence. Paginate list endpoints, use consistent HTTP status codes, reject unknown input fields where practical, and avoid leaking sensitive fields in DTOs or logs. Generate and maintain OpenAPI documentation.

## 8. Security, privacy and prototype limitations

- Never claim integration with official ZRP, vehicle registration, licensing, stolen-vehicle or payment systems without written authorisation and verified interfaces.
- **Do not implement automated wanted-person or stolen-vehicle alerts using real records.** Any status shown in this student build must be explicitly fictional/demo.
- Do not build facial recognition, bulk surveillance, automatic number-plate recognition, predictive policing, or persistent officer/driver location tracking as part of this MVP.
- Request GPS permission only when the officer explicitly records a location; permit manual entry where reasonable.
- Validate all inputs on the backend; guard against injection, XSS and broken object-level authorisation.
- Apply safe upload limits, allowlisted MIME types, content inspection as feasible, non-executable file storage, unpredictable filenames and authenticated download routes.
- Keep secrets out of Git; ship `.env.example`, not `.env`.
- Log who created/reviewed records without putting passwords, token values, evidence bytes or personal data into logs.
- Store evidence privately; document data retention and how demo data is removed.
- Use fictional sample details and watermark PDFs/print views as demos. For any actual deployment, require a separate security, privacy, legal, accessibility and operational review.

## 9. UI/UX direction

Use a clean, accessible traffic-operations style. Distinguish `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CONFIRMED`, and `CANCELLED` states clearly; do not depend on colour alone. Include form validation, keyboard-accessible controls, readable contrast, loading indicators and meaningful error messages. Make `DEMO / UNIVERSITY PROTOTYPE` visible on login, dashboard, officer screens and tickets. Do not use an official crest or protected branding unless the user has permission; a neutral text wordmark is sufficient.

## 10. Implementation order — complete one phase at a time

**Phase 0 — Inspect and plan:** Read existing project files, list what works and what is missing, capture architectural decisions in `docs/decisions.md`, and make a short implementation checklist.

**Phase 1 — Local foundation:** Scaffold API, dashboard and Flutter app; configure PostgreSQL, migrations, seed scripts, linting, formatting, `.env.example` and README. Verify all projects start locally.

**Phase 2 — Backend MVP:** Add auth, roles, vehicle search, offence categories, offence CRUD, ticket generation, audit events and integration tests. Seed fictional users/vehicles/categories. Verify with Swagger or automated tests.

**Phase 3 — Officer app MVP:** Implement login, vehicle search, offence creation, submission, demo ticket view and reliable loading/error states. Wire screens to real local API data, not hard-coded mock screens.

**Phase 4 — Dashboard MVP:** Build login, statistics, offences/incidents lists, ticket detail and supervisor review. Confirm updates created on the mobile app appear in the dashboard.

**Phase 5 — Incidents and maps:** Add incident reports, checkpoint management, OSM-based dashboard map and basic analytics.

**Phase 6 — Hardening:** Add evidence upload security, offline draft/sync design if feasible, public ticket verification, audit review, threat model, accessibility and performance checks.

Do not begin Phase 6 features while the MVP workflow is broken. If time is limited, finish and test Phases 1–4 instead of adding incomplete modules.

## 11. Testing and acceptance criteria

At minimum, demonstrate all of the following:

1. An officer signs in; invalid credentials fail and a staff API rejects unauthenticated access.
2. A seeded fictional plate returns the correct record; an unknown plate returns a clear no-result state.
3. The officer creates a draft, submits it, and gets exactly one demo ticket even if submission is retried.
4. The dashboard displays the newly submitted offence without requiring a database reset.
5. A supervisor reviews it; the officer cannot perform supervisor/admin-only actions.
6. A public or unauthorised request cannot enumerate vehicle records or download private evidence.
7. Invalid payloads and oversized/disallowed files fail safely.
8. Incident/checkpoint markers correspond to stored fictional coordinates and include map attribution.
9. Database migrations and seed scripts run on a fresh local setup.
10. README instructions reproduce the demo on another development machine.

Add automated tests for critical transitions and authorisation boundaries. On each phase, run available lint, type-check, unit/integration tests and builds; fix failures before marking the phase complete. If a command cannot run, report the exact reason rather than claiming a pass.

## 12. Working rules for Codex

- **First read this file, README, existing code, relevant project documentation and task/rubric files if present.** The supplied course rubric and approved documentation outrank optional feature suggestions here; flag contradictions explicitly.
- Preserve existing working functionality and previously approved content; make focused, reviewable changes.
- Prefer typed contracts, small cohesive modules, dependency injection, reusable components and descriptive naming.
- Use the repository's existing package manager and conventions when present. Do not add unnecessary libraries or paid services.
- Do not invent government regulations, offence tariffs, legal processes, official databases, institutional requirements or real-world crime statistics. Mark unresolved domain assumptions as `TO VERIFY` in the documentation.
- When modifying the schema, create a migration, update the seed data and tests, and document any breaking changes.
- After each implementation step, state: files changed, functionality added, commands actually run and their results, known gaps, and the next concrete step.
- If the user asks for the four university documentation chapters, use the provided assessment template/rubric and distinguish implemented functionality from planned functionality.

## 13. First task when launched in Codex

Inspect the current repository. If it is empty, create the Phase 1 foundation and minimal Phase 2 API slices needed for login, fictional vehicle search, and offence/ticket creation. Include setup commands and seed data. If the repository already has code, identify the nearest incomplete phase and implement the smallest end-to-end feature that advances the MVP. **Do not stop after generating a plan or placeholder files.**
