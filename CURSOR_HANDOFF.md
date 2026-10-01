# Cursor development brief — ZRP Smart Traffic

## Your task

Continue developing, testing and deploying the **existing** ZRP Smart Traffic Management System in this repository. Act as the implementation engineer: inspect first, make focused changes, run appropriate checks, and report actual results. Do not replace the application with a new scaffold or static mockup.

This is an academic prototype using fictional records. It is not an official ZRP system and has no government database connection. Preserve the discreet **Academic Prototype** footer and explicit demo ticket/payment notices. Do not invent legal tariffs, official integrations or real traffic statistics.

## Read first

1. `AGENTS.md` — project requirements, security boundaries and working rules.
2. `README.md` — setup, current features and role workflows.
3. `DEPLOYMENT.md` — hosting configuration and chronological deployment updates. Later updates supersede earlier status statements; verify live state before acting.
4. `docs/decisions.md`, `docs/02-requirements.md`, `docs/03-architecture.md`, `docs/04-testing-and-evaluation.md` and `docs/api.md`.
5. Relevant source, migrations, tests and any supplied university rubric. Do not assume a rubric exists.

Start with `git status --short` and `git diff`. The workspace contains uncommitted deployment changes and earlier UI/mobile work. Preserve both. Do not reset, delete or overwrite changes to obtain a clean tree. Review what belongs in each commit; never stage everything blindly.

## Architecture to retain

| Area | Existing implementation |
| --- | --- |
| Repository | npm workspaces, rooted in this folder |
| API | Node 22, NestJS, TypeScript, Express; `apps/api` |
| Database | PostgreSQL, Prisma; schema and migrations in `apps/api/prisma` |
| Web | React, TypeScript, Vite; `apps/dashboard` |
| Mobile | Flutter/Dart, Android-first; `apps/officer-mobile` |
| Authentication | Argon2id passwords; random bearer sessions hashed in PostgreSQL, revocable and expiring after 30 minutes |
| Ticket access | Motorist account plus random ticket reference and separate verification code; separate ticket-scoped session |
| Live updates | Operational polling and public-notice polling |
| Maps | Leaflet/OpenStreetMap, attribution retained |
| Evidence | Private authenticated disk storage; decoded/re-encoded JPEG/PNG uploads with limits |
| Local database | Docker Compose or existing portable PostgreSQL |

The API prefix is `/api/v1`; health is `/health`. Swagger is available locally at `/api/docs` and disabled in production. This application does **not** use JWTs, refresh tokens or authentication cookies. Do not introduce them merely to deploy it.

The frontend uses `VITE_API_URL` as a public backend **origin**, without `/api/v1`; its shared helper adds the prefix. Unset locally, requests use the Vite proxy. Update all transports consistently, including public ticket requests and evidence uploads/downloads.

Navigation uses React state with a special `/admin` pathname, not React Router. SPA fallback must preserve direct loading and refresh. Do not claim every example URL is an implemented dedicated screen.

## Preserve existing capabilities

| Role | Required workflow |
| --- | --- |
| `ADMIN` | Account activation/roles, officer-supervisor assignments, categories, settings, audit/security review |
| `SUPERVISOR` | Assigned offence review, incidents, checkpoints, operational analytics and traffic alerts |
| `OFFICER` | Fictional vehicle lookup, own offence drafts, evidence, idempotent ticket issuance, incident reporting and activity |
| `USER` | Motorist sign-in, verified ticket details, simulated payment/status, notices and road reports |

Keep the three normal login choices **User, Officer, Supervisor** and the separate `/admin` entry. Server roles and ownership checks are authoritative. Admin access does not automatically grant all operational record access.

Preserve draft revision checks, audited discard, duplicate prevention, unique offence-to-ticket relationships, reviewer assignment and audit history. Preserve the separate public-ticket session and its relationship to the motorist account session. Signing out or expiring an account must invalidate access as implemented.

## Development priorities

1. Verify the current online workflow; fix any regression before extending functionality.
2. Complete the existing production deployment using Netlify + Render + hosted PostgreSQL.
3. Verify the complete officer → ticket → supervisor → motorist workflow against that deployment.
4. Complete Android emulator/device acceptance, including camera/GPS permissions, denied permission, network errors and mobile-to-dashboard synchronization.
5. Update testing evidence and documentation to match the implemented behavior.
6. Consider encrypted offline drafts/outbox only after online acceptance is stable. Preserve idempotency during retries; do not silently duplicate submissions.

Implement one meaningful end-to-end increment at a time. Do not rewrite working features to simplify hosting. No facial recognition, automatic plate recognition, bulk surveillance, predictive policing, real payment collection or persistent location tracking belongs in this MVP.

## Deployment handoff

The chosen architecture is **Netlify frontend → Render NestJS service → hosted PostgreSQL**, with private persistent evidence storage. Keep NestJS as a normal Node service; do not convert it to serverless functions.

Known resource identifiers, which are not credentials:

- GitHub: `https://github.com/rsibanda/zrp-smart-traffic`, existing connected branch `main`.
- Netlify team: `rsibanda`.
- Netlify site: `thunderous-moxie-b0872a`.
- Site URL: `https://thunderous-moxie-b0872a.netlify.app`.
- Site ID: `0d8dccfe-7c14-43c5-b1ff-2e57a80211c4`.
- Requested Neon project: `fancy-mouse-12186125`, branch `production`.

Netlify settings were updated through its API: base `.`, build `npm run build:web`, publish `apps/dashboard/dist`. Node 22 is configured in `netlify.toml`. The existing site was published previously, but **this updated full-stack deployment has not been verified**. At the last check, its `VITE_API_URL` was absent and deployment source changes had not been pushed. Recheck before changing anything.

Render service discovery and provisioning have not been completed. Inspect existing services before creating a service. Do not delete/recreate resources. Do not incur paid hosting charges without the user's approval of the concrete plan and cost.

### Credentials and authentication

- Read secrets only from the runtime environment when required. Never repeat them in chat, command output, source, logs, reports, example files or Git.
- Never put secrets in `VITE_*` variables. Browser bundles are public.
- Use `RENDER_API_KEY` only for Render operations and `NETLIFY_AUTH_TOKEN` only for Netlify operations.
- Prefer an existing hosted `DATABASE_URL` or authenticated Neon access. Supabase management access is unnecessary if all that is needed is PostgreSQL.
- If Supabase management truly becomes necessary, use `SUPABASE_ACCESS_TOKEN`. Use `SUPABASE_DB_PASSWORD` only for database CLI operations requiring it.
- Credentials previously pasted into chat must be treated as exposed and rotated. This file intentionally contains none of their values.
- At the last check, credentials were absent from process/user/machine environments. Check presence only; do not dump environment contents. PowerShell commands pasted into a chat do not set the agent's environment.
- Neon CLI 6.4.0 and project skills were installed. MCP installation needed authentication. Neon browser login reached its callback but failed timestamp validation; the local clock was approximately nine hours ahead and Windows Time was stopped. The timezone was subsequently changed, but clock synchronization and successful login still need verification. Do not disable token validation to work around this.

### Deployment sequence

1. Check runtime credentials and Neon login status without printing secrets. Resolve clock/sign-in issues if still present.
2. Inspect existing Render services and the requested Neon production branch. Determine database contents, connection options and evidence-volume availability.
3. Use the existing PostgreSQL/Prisma schema. Before provisioning via Neon, inspect a configuration plan. Read the installed Neon skill and current CLI help. Verify the correct config package name; earlier documentation and the pasted setup instructions disagreed. Do not install an unverified package or replace authentication with Neon Auth.
4. Preserve local database configuration when linking Neon: use `--no-env-pull` where supported. Do not overwrite the local `.env` with hosted credentials. Keep `.neon` excluded from Git.
5. Configure the existing Render service, or prepare a new service when necessary. Use repository-root build context. Native build: `npm ci && npm run build:api`; start: `npm run start:api`. An optional Dockerfile is at `apps/api/Dockerfile`.
6. Set backend environment values below in Render. Require private persistent storage for evidence; an ephemeral path is insufficient. Initially use one instance because storage is local and rate-limit counters are in memory.
7. Back up existing hosted data and review migrations. Run the release migration command `npm run db:migrate` against the intended database. Never run local integration/reset helpers against production. Stop for confirmation before any destructive database operation.
8. Bootstrap fictional accounts only if explicitly needed on an empty academic database. Production seed requires `ALLOW_DEMO_SEED=true` and a private `DEMO_PASSWORD`; it refuses a nonempty user table. Never seed automatically on deploy. Remove bootstrap variables afterward.
9. Verify the real Render URL returns `200` and `{"status":"ok"}` from `/health`. Verify failure responses do not disclose database details.
10. Set backend `CORS_ORIGIN` to the exact Netlify HTTPS origin. Verify Authorization preflight and rejection of unapproved origins. Configure trusted proxy addresses only with verified host information.
11. Set Netlify `VITE_API_URL` to the real HTTPS backend origin, review and push intended source changes, then redeploy. Do not deploy the earlier synthetic test API origin.
12. Verify browser authentication, all four roles, session expiry/logout, private evidence and the end-to-end workflow. Restart/redeploy the API and verify evidence still downloads.

### Production backend environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | Host-assigned port, default 3000 |
| `DATABASE_URL` | Secret managed PostgreSQL URL with appropriate TLS |
| `CORS_ORIGIN` | Exact allowed HTTPS frontend origin(s), comma-separated |
| `EVIDENCE_DIRECTORY` | Absolute private persistent-volume path |
| `TRUST_PROXY` | Optional verified proxy IP/subnet list; never unrestricted trust |

`JWT_SECRET` and `JWT_REFRESH_SECRET` are not applicable. The Docker evidence path is `/var/lib/traffic/evidence`; mounted storage must be writable by the container user (UID 1000). Keep the evidence directory outside the public frontend directory. Backup database and evidence together.

## Local work and checks

For this prepared Windows workspace:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
. ./scripts/use-local-tools.ps1
./scripts/start-local-db.ps1
npm run db:generate
npm run dev:api
# In a second terminal, enable tools and run:
npm run dev:dashboard
```

Follow README for first-time setup on another machine. Do not overwrite an existing `.env`. Review migrations before applying them. Use `npm ci` when dependencies need installation, preserving the lockfile.

Run appropriate checks for each change:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
# Against a disposable local database only:
npm run test:integration
node scripts/check-fresh-database.mjs
```

Production build commands are `npm run build:api` and `npm run build:web`. Check formatting only on changed files before broad formatting, so unrelated work is preserved. For Flutter changes, run `flutter analyze` and `flutter test` inside `apps/officer-mobile`, then verify the workflow on an emulator/device when available.

Last recorded results: 41 API unit/configuration tests, 6 web tests and 18 PostgreSQL integration tests passed, along with builds, type-checking, lint, Prisma validation and isolated fresh-schema migration/seed checks. These are historical results, not a substitute for testing new changes. Docker engine/container verification, current Android device acceptance and hosted four-role acceptance remain pending.

## Acceptance checklist

- [ ] All staff and motorist roles can sign in to their permitted interfaces; invalid credentials/category mismatches fail safely.
- [ ] Anonymous and unauthorized users cannot enumerate vehicles, read another officer's restricted records or download evidence.
- [ ] A fictional plate lookup succeeds and an unknown plate has a clear no-result state.
- [ ] An officer saves a draft and submits it; retries produce exactly one ticket.
- [ ] The assigned supervisor sees and reviews the ticket without resetting the database.
- [ ] The motorist verifies that ticket with its reference and separate code and sees only permitted details.
- [ ] Payment simulation remains explicitly simulated; no real money is collected.
- [ ] Incidents, checkpoints, alerts, maps and stored coordinates remain consistent.
- [ ] Evidence rejects invalid/oversized uploads, stays private and persists through deployment.
- [ ] Logout, expiry, forbidden actions, API downtime and timeouts have useful, sanitized UI states.
- [ ] Production health, HTTPS, CORS and SPA direct-load/refresh behavior are verified.
- [ ] Documentation distinguishes implemented features, tested behavior and pending work.

## Reporting and completion

After each increment, report files changed, functionality added/fixed, commands actually run and their results, remaining gaps and the next concrete step. Do not claim a live deployment from a successful local build or an existing Netlify page. Deployment completion requires verified live API/database connectivity and the role workflows above.

If external access blocks deployment, finish independent code/documentation work and request only the missing access or decision. Never fabricate credentials, official integrations, test results or deployed URLs.

## Current free deployment handoff — 1 October 2026

The user rejected paid Render compute/disk. Use `render.yaml` with `plan: free`, no disk, and private Neon object storage through `EvidenceStorage`. Local evidence storage remains the development default. This supersedes any earlier paid-disk plan or missing-credential status in this handoff.

Neon project `noisy-brook-51882053`, production branch `br-summer-art-b1guyqmt`, has all six migrations and private bucket `traffic-evidence`; accounts are not seeded. Render environment group `zrp-traffic-production` contains database/storage secrets. Read provider credentials only from the environment (Windows User scope if absent from the current process); never echo them or write them to source. No Render service has been created. Its Blueprint validation still reports that GitHub branch main cannot be found: the user must grant Render access to `rsibanda/zrp-smart-traffic` before deployment can continue. Do not change repository visibility.

Latest checks passed: 45 API tests, 6 web tests, 18 local database integration tests, typecheck, lint and API build. Actual private bucket upload/read/anonymous denial passed. Source remains uncommitted alongside existing user UI/mobile edits; preserve those edits. See DEPLOYMENT.md's current status first. Hosted health/CORS, seeding, Netlify rebuild and four-role acceptance remain pending.

## Starter prompt for Cursor

> Read `CURSOR_HANDOFF.md` and the files it references. Inspect the existing workspace and preserve all uncommitted work. Continue this implementation incrementally, prioritizing the working end-to-end workflow and the pending Render/Neon/Netlify deployment. Use environment-only secrets and stop before destructive database operations. Verify current hosting/authentication state before changes, run relevant tests, and implement the next concrete step rather than returning only a plan.
