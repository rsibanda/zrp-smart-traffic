# Decisions

- Inspection: the only existing file was `AGENTS.md`; no README, source, rubric, approved chapters or package manager files existed. Preserve that file. Use the existing directory as repository root to avoid needless nesting.
- Start at Phase 1 and include the minimal Phase 2 API slices requested by the first-task instruction. Small clients exercise this slice; their presence does not mark later phases complete.
- Use npm workspaces, NestJS 11.2.5 and Prisma 6.12 together with the v6 schema datasource convention. Keep Prisma CLI and client versions identical. See [Prisma v6 connection URLs](https://docs.prisma.io/docs/orm/v6/reference/connection-urls). Initial dependency auditing identified advisories in NestJS 10, Vitest 3 and Prisma 6.19's optional configuration dependencies; revised versions are checked before accepting the foundation. Prisma 6.12 avoids the affected configuration package without changing the datasource API used by this slice.
- Root npm overrides align all NestJS peer dependencies to 11.2.5 and select patched Multer/qs versions. Keep these overrides until the framework's transitive ranges include those fixes. NestJS 11 retains compatibility with the CommonJS/Jest setup; an ESM migration is outside this foundation increment. Commit the npm lockfile for reproducibility.
- Prisma CLI is a root development dependency so it shares the module location of the Prisma client. The generated client has an explicit, ignored output at `apps/api/generated/client`; generate it before checking/building. This fixes client resolution on a fresh npm workspace installation.
- This Windows workspace uses official portable PostgreSQL binaries because Docker was absent. Compose remains the default portable configuration for other machines. The local data directory and tool downloads are ignored. The setup helper creates random credentials without printing them and preserves existing `.env` files.
- Use opaque bearer sessions rather than JWT refresh handling. Store only a SHA-256 token digest in PostgreSQL, enforce a 30-minute expiry and revoke on logout. In-memory client storage avoids durable bearer credentials. `/auth/refresh` is intentionally omitted for this session strategy.
- Use Argon2id password hashing, generic credential errors and per-IP login throttling. Forwarded IP headers are not trusted. A single-process memory rate limiter is sufficient only for local demos.
- Create drafts with a client UUID request key. Reusing a key with different content returns 409. Submit under serializable isolation, retry conflicts, enforce one ticket per offence and atomically append audit records. No retry creates a second ticket for the same offence.
- Assign officers explicitly through administration. Store the supervisor on each offence/incident and enforce it on reads/reviews; hide drafts from supervisors. Reassignment transfers unfinished records atomically; resolved history keeps its original assignment.
- Review state machine: `DRAFT -> SUBMITTED` through ticket issuance; `SUBMITTED -> UNDER_REVIEW -> CONFIRMED | CANCELLED` through assigned supervisor review. Terminal states cannot be reopened. Cancellation also cancels the demo ticket. This is a proposed classroom workflow, not a legal procedure.
- Amounts are Decimal snapshots expressed as invented training units. No official tariffs or settlement assertions.
- Exact plate lookup only; no public registry. Local host binding and private PostgreSQL port by default. All future file endpoints must require authenticated, ownership-checked access.
- Generate Android runner files using the user's installed Flutter SDK; retain supplied Dart source. Flutter/Android SDK and Docker were absent during initial inspection, so startup across all projects remains unverified.
- TO VERIFY: course rubric, proposed review workflow, eventual retention period, assignment rules and accessibility evaluation. No domain or institutional rules have been invented.
- Android finishing increment: prefer the user's Android Studio SDK and bundled Java over the incomplete portable Android SDK. Official command-line tools 19.0 were downloaded with Google's repository SHA-1 verified because the newer native SDK wrapper previously crashed on this Windows installation. Android 36, NDK 28.2 and CMake are installed alongside the user's existing Android 37/Pixel_8 setup.
- Draft updates use optimistic revision checks plus serializable transactions. Discard is an audited terminal state rather than deletion. Existing rows receive revision 0 through a non-destructive migration.
- Mobile location capture is an explicit one-shot permission request, never a subscription or background service. Manual location remains available. Offline encrypted persistence remains a documented optional design.

## Motorist account login (September 28)

The user's clarified requirement supersedes the original anonymous portal entry: the main login offers User (motorist), Officer and Supervisor. USER is a separate least-privilege database role; it cannot query staff records. Existing ADMIN accounts remain on a separate `/admin` sign-in page to preserve account management. An optional login category is checked against the stored role, never used to assign permissions; older mobile clients may omit it.

Motorists sign in before verifying a ticket or reporting an incident. Ticket verification still requires both reference and a separate code, and issues a restricted ticket token tied to the originating account session. Logout, account session expiry, disabling the account and role changes invalidate ticket access. Reports retain the reporting account and remain unverified reports for supervisor review. General notices remain publicly readable by API, but are not displayed on the login page.

Migration `20260928100000_motorist_accounts` adds USER and the parent-session foreign key. It invalidates only legacy anonymous ticket sessions; ticket/payment/history records and existing accounts are preserved. Seed adds `user@demo.invalid`; administrators provision additional motorist accounts. No self-registration or automatic matching to driver records is implied.

## Operational terminology (September 28)

The user's explicit UI revision supersedes the earlier large banner/watermark presentation in AGENTS.md. Web and mobile now use ZRP Smart Traffic branding and a small Academic Prototype footer. This is a presentation change, with no official integration or endorsement asserted. Payments remain accurately labelled simulations and collect no money.

Session `name` remains the source of the displayed identity; role labels are mapped to Motorist, Traffic Officer, Supervisor and Administrator. No new session fields or personal identifiers were added. Generated seed display names and known initial records are updated by an exact-match data migration, preserving existing IDs, relationships, credentials and submitted ticket references. The seed plate is now ABC1234; normalization still accepts ABC 1234 or abc-1234. Existing account email addresses remain unchanged.

Status labels are presentation-only. Incident OPEN displays Submitted and IN_PROGRESS displays Under review. Existing offence states display readable badges. Payment NOT_SIMULATED displays Pending and SIMULATED_PAID displays Paid within the explicitly simulated-payment interface. Checkpoint CLOSED remains Closed: the existing data cannot distinguish cancellation from completion. Additional requested states (incident Assigned/Closed, checkpoint Completed/Cancelled, offence Paid, payment Failed/Refunded) were not fabricated or added because doing so would change workflow/API contracts. Offence confirmation and ticket payment remain separate.

## Android account-type selection

The mobile sign-in now offers User, Officer and Supervisor using the existing login category contract. Server roles remain authoritative. Officer workflows remain in the existing screen; motorist and supervisor screens use a separate RoleWorkspace with account-scoped requests. Verified motorist tickets use their separate ticket token, never a staff token. Failed ticket verification retains the account so users can correct the verification code. Sign-out returns to account selection and disposes role-specific state and refresh timers. No backend permissions or database relationships changed.

## GitHub and Netlify deployment

Selected Strategy A: the existing React/Vite workspace builds on Netlify, while NestJS stays a persistent Node service with managed PostgreSQL and private persistent evidence storage. Existing sessions, RBAC, polling, ticket verification and mobile contracts are retained. Frontend VITE_API_URL is public; production backend configuration requires exact HTTPS CORS origins and an absolute evidence path. JWT/refresh secrets are not applicable to this session implementation. Swagger is local-only and /health exposes a minimal database readiness result. Production seed is explicitly opted in and refuses an existing user table.

The deployment request supersedes the earlier local-only hosting limitation; fictional records, Academic Prototype footer and simulated payments remain required. Netlify team rsibanda was supplied, but authenticated publishing access and backend/database hosting are not yet available. See DEPLOYMENT.md for the assessment, exact settings, commands and remaining live verification.

Checklist: deployment files and API URL transport added; local build/security/regression checks in progress; authenticated Netlify setup, backend provisioning, migrations on the hosted database and four-role hosted smoke tests pending.

Deployment validation completed: 41 API unit/configuration tests, 6 web tests and 18 PostgreSQL integration tests passed; fresh-schema migrations/seed, builds, typecheck, lint and targeted formatting passed. Container build remains unverified because Docker Desktop's engine is unavailable. Hosted deployment checks remain pending.

## Free hosted evidence storage â€” 1 October 2026

The user selected free hosting instead of paid Render compute and a persistent disk. Keep the NestJS API on Render Free and persist evidence in a private Neon S3-compatible bucket. An injected EvidenceStorage adapter preserves local development storage and existing validation, authorisation, deduplication and orphan cleanup. Remote keys carry an `s3:` prefix; no schema migration or existing local file conversion is required. Storage credentials are branch-scoped and configured only in the backend environment group. Free-service cold starts and provider quotas are documented limitations of this small academic demo.

The new Neon project has all six migrations and a private bucket; no demo accounts are seeded yet. Local checks now pass 45 API tests, 6 web tests and 18 PostgreSQL integration tests, plus typecheck, lint and API build. Actual object upload/read and anonymous denial passed. Render GitHub repository access is still missing, so backend deployment and hosted role checks remain pending. DEPLOYMENT.md is the current operational status.

## 2026-10-02 â€” Account ownership and payment simulation

The approved interface/payment brief requires persistent account linkage and payment history, which the prior per-ticket access model cannot provide alone. Add nullable vehicle/account assignment and immutable ticket/account snapshots; retain reference/code verification for historical unlinked tickets. Admins explicitly assign vehicles; no name-based identity inference or public registry access. No existing authentication or enforcement role is widened. Payment attempts and receipts use serializable transactions, idempotency keys and a partial unique success index. The legacy paid marker remains the source shared with old clients. Keep reference units, configurable non-official points and due periods; do not infer historical points/deadlines. No new notification infrastructure or provider network integration. Details and validation: `interface-and-payments.md`.

## Readable ticket references and currency presentation

The requested refinement supersedes the earlier training-unit presentation: simulated amounts now display in USD, with numeric historical values preserved. Add a separate database-generated displayReference; preserve opaque publicReference and internal IDs for compatibility. Verification accepts either reference but retains code, session, rate limits and ownership checks. Do not infer vehicle ownership from a ticket claim or rename a historical generic offence. The existing configured offence category determines fine and points; no arbitrary severity scale is invented. See ui-data-refinement.md.

## 2026-10-05 — Motorist vehicle management

Extend Vehicle.motoristId with a request history, not a second ownership model. Keep approval ADMIN-only to preserve existing assignment authority. A plate alone never establishes ownership or reveals another account's vehicle. Approval rechecks assignment in a serializable transaction; unlinking also rechecks unpaid tickets. Historical ticket account snapshots remain unchanged. Existing links are verified without fabricated verification timestamps. Registration status is internal, and only stored metadata is displayed. See [vehicle management](vehicle-management.md) for routes, workflow and validation scope.

## 2026-10-05 — Motorist reference layout

Use the supplied UPGRADE.jpg as the motorist visual reference while retaining existing account APIs and workflows. Consolidate primary navigation to five destinations, put notices/reports under Profile, and use URL-backed web tabs plus mobile bottom navigation. Four summary values and recent records are read from existing endpoints; no mock production values or schema changes. See [motorist reference layout](motorist-reference-layout.md) for files, routes, assumptions and validation.

## 2026-10-06 — Traffic Officer reference layout

Refactor the existing officer clients around Traffic officer.png, retaining the current API handlers and role boundaries. Derive overview totals from all permitted result pages, with ticket issuance grouped by Harare calendar day. Do not invent checkpoint staffing/vehicle counts, incident severity or motorist names missing from a response. Keep ticket allocation on submission and confirmation before issue. Preserve citation and incident state across navigation. See [officer reference layout](officer-reference-layout.md) for files, assumptions, routes and validation.

## 2026-10-09 ? Supervisor reference layout and vehicle approval authority

The latest user brief explicitly supersedes the 5 October ADMIN-only request-review decision: add dedicated SUPERVISOR vehicle approval routes while preserving administrative route guards. Reuse the existing serializable ownership transaction and VERIFIED enum, add safe audited detail reads and require a separate confirmation in both staff clients. Command-centre payments follow assigned offences and use Harare calendar-day totals. Do not invent missing incident/team or checkpoint-count data or unsupported offence transitions. See [supervisor reference layout](supervisor-reference-layout.md).

## 2026-10-30 - Ticket QR, vehicle applications and responsible-driver points

Implement the supplied remaining-work brief within the existing repository. Extend vehicle requests, private storage and payment simulation; retain offence configuration and navigation. QR tokens are hashed, revocable and passed in URL fragments. They grant no account entitlement. Document-backed applications preserve submitted fee snapshots and require supervisor decisions; approval cannot replace another motorist's ownership.

Points attach to an explicitly verified responsible driver. Reuse atomic submission: ticket ISSUED and offence SUBMITTED. Debit once on issuance, credit once on cancellation, and leave payment independent. Historical tickets remain LEGACY_NOT_ASSESSED without a retrospective debit. Defaults are academic configuration, not law. See ticket-applications-points.md for details, retention policy and deployment prerequisites.