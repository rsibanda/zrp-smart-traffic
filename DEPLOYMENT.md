# GitHub + Netlify deployment

Status: free hosting configuration tested locally; Neon database and private evidence bucket created. Render deployment awaits GitHub repository access. No updated public deployment has been verified.
Destination team: https://app.netlify.com/teams/rsibanda
Repository: https://github.com/rsibanda/zrp-smart-traffic

## Current free hosting plan — 1 October 2026

This section supersedes the historical progress entries below, including the paid disk proposal. The user selected free hosting; do not create paid compute, disks or upgrades.

- **Database:** Neon Free project `zrp-smart-traffic` (`noisy-brook-51882053`), production branch `br-summer-art-b1guyqmt`, PostgreSQL 16 in Frankfurt. All six migrations applied. Demo accounts are not yet seeded.
- **Evidence:** private Neon bucket `traffic-evidence`. The API supports `EVIDENCE_STORAGE=s3`; local development retains private filesystem storage. Server-side image validation, ownership checks and authenticated downloads remain in place. New remote storage keys have an `s3:` prefix; no schema change or existing evidence conversion was needed.
- **Backend:** `render.yaml` selects Render Free without a disk. Render environment group `zrp-traffic-production` holds the database URL and branch-scoped storage credentials. No Render web service exists yet.
- **Frontend:** reuse `https://thunderous-moxie-b0872a.netlify.app`. Set `VITE_API_URL` only after the backend is healthy, then rebuild. The updated frontend has not been published.

The free Blueprint passes the billing constraint but Render still returns `branch main could not be found`. GitHub's main branch exists. Connect GitHub in the Render workspace and grant access to `rsibanda/zrp-smart-traffic`, then revalidate. Keep the repository private. Source changes still need a reviewed commit/push before deployment.

Validation: typecheck, lint, 45 API unit/configuration tests, 6 web tests, 18 local PostgreSQL integration tests and the API build passed. A synthetic object passed upload, authenticated read and anonymous-access rejection on the actual private bucket; only that synthetic object was removed. Hosted API authentication, all four role workflows, CORS and redeployment persistence remain pending.

Free-tier limits apply: [Render Free](https://render.com/docs/free) services spin down after inactivity, so a cold start may exceed the browser request timeout and require retrying. [Neon pricing](https://neon.com/pricing) currently includes 5 GB object storage per free project; monitor provider quotas and keep this a small fictional demo. Do not silently upgrade when limits are reached. Back up database records and corresponding private objects together; no automatic retention job is configured.

Next: grant Render repository access, push the reviewed deployment source, create the free backend linked to its environment group, bootstrap fictional accounts explicitly, verify `/health`, configure Netlify's API origin and verify hosted role workflows.

## Assessment and strategy

Use Strategy A: Netlify serves React; a separate persistent Node service runs NestJS; managed PostgreSQL stores the data. Keep the existing sessions, permissions, polling and private evidence routes. No serverless conversion, database replacement or UI rewrite is needed.

| Item                 | This repository                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Layout               | npm workspaces at repository root                                                                                  |
| Web                  | React 18 + TypeScript + Vite, `apps/dashboard`                                                                     |
| API                  | NestJS 11 + Express, `apps/api`, port 3000 by default                                                              |
| Database             | PostgreSQL + Prisma 6; six committed migrations                                                                    |
| Mobile               | Flutter, `apps/officer-mobile`; deploy separately                                                                  |
| Authentication       | Argon2id; random bearer tokens hashed in PostgreSQL; 30-minute revocable sessions                                  |
| Refresh/cookies      | No refresh tokens, JWT or authentication cookies; sign in again on expiry                                          |
| Browser API          | `VITE_API_URL` origin plus `/api/v1`; unset uses the local Vite proxy                                              |
| CORS                 | Exact `CORS_ORIGIN` list; legacy `WEB_ORIGIN` remains supported                                                    |
| Navigation           | React state and `/admin` pathname; no React Router                                                                 |
| Updates              | 10-second operational polling, 30-second notice polling; no WebSockets                                             |
| Evidence             | Authenticated private Neon object storage in hosting; private filesystem locally                                    |
| Local services       | PostgreSQL Docker Compose or existing portable PostgreSQL                                                          |
| Existing environment | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PORT`, `HOST`, `WEB_ORIGIN`, `DEMO_PASSWORD` |

## Exact Netlify settings

Import the GitHub repository into the **rsibanda** team. Use the root `netlify.toml`:

| Setting           | Value                                    |
| ----------------- | ---------------------------------------- |
| Base directory    | `.` (repository root)                    |
| Package directory | Leave blank                              |
| Build command     | `npm run build:web`                      |
| Publish directory | `apps/dashboard/dist`                    |
| Node              | 22                                       |
| Build environment | `VITE_API_URL=https://YOUR-BACKEND-HOST` |

The backend URL is the origin only: no `/api/v1`, credentials, query string or fragment. It is public and compiled into JavaScript. Set it before building and redeploy after changing it. Do not add database credentials, demo passwords or server secrets to Netlify. Netlify builds fail if this value is missing or uses HTTP/localhost.

The SPA fallback serves `index.html` for direct links including `/admin`. Other paths load the existing login/application shell; this does not invent separate screens or bypass role checks. Keep the Academic Prototype footer and existing ticket/payment notices.

These settings follow [Netlify monorepo configuration](https://docs.netlify.com/build/configure-builds/monorepos/) and [SPA rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

## Backend and database

Use the configured Render Free Node 22 service with HTTPS, managed PostgreSQL and private Neon object storage. Use one API instance initially: rate-limit counters are in memory. An ephemeral filesystem cannot preserve uploads, so hosted evidence must use S3 mode. No paid service has been provisioned.

Build from the repository root:

```sh
npm ci
npm run build:api
```

Start command: `npm run start:api`. Optional container build: `docker build -f apps/api/Dockerfile -t zrp-traffic-api .`. Build the Prisma client on the deployment OS; do not upload the Windows generated client. The container retains migration/bootstrap tooling for explicit one-off commands. Mount private writable storage at `/var/lib/traffic/evidence`, owned by UID 1000 in the container.

Configure these **backend-only** environment values:

| Variable             | Value/purpose                                                                    |
| -------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`           | `production`                                                                     |
| `PORT`               | Host-assigned port, otherwise `3000`                                             |
| `HOST`               | `0.0.0.0` (production default)                                                   |
| `DATABASE_URL`       | Secret managed PostgreSQL connection URL with provider-required TLS settings     |
| `CORS_ORIGIN`        | Exact HTTPS Netlify site origin; comma-separated if a custom domain is also used |
| `EVIDENCE_STORAGE`   | `s3` for free hosted deployment; `local` for development                          |
| `EVIDENCE_S3_BUCKET` | `traffic-evidence` in hosted S3 mode                                              |
| `AWS_ENDPOINT_URL_S3` | HTTPS branch storage endpoint, backend only                                     |
| `AWS_REGION`        | `eu-central-1` for this bucket                                                    |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Branch-scoped storage secrets, backend only                  |
| `EVIDENCE_DIRECTORY` | Required absolute persistent path only for production `local` storage mode       |
| `TRUST_PROXY`        | Optional proxy IP/subnet list supplied by host; never `true` or wildcard         |

No `JWT_SECRET` or `JWT_REFRESH_SECRET` is used or needed. Bearer sessions work across HTTPS origins without cross-site cookies. Confirm the hosting proxy preserves Authorization headers and configure its trusted addresses before testing login rate limits. Do not allow arbitrary forwarded IP headers to bypass throttling. PostgreSQL must not be exposed through Netlify or a browser admin endpoint.

Back up the database and matching evidence before migrations. Review migrations (including the existing display-text data updates). Use a direct provider database connection for migrations when its pooled endpoint does not support them. In a one-off backend release job with `DATABASE_URL` securely set:

```sh
npm run db:migrate
```

This runs `prisma migrate deploy`; it does not reset or seed data. Never use `migrate reset` or `db push` on the hosted database. Run migrations once before starting the new release; rollback requires a compatible previous application or restoring the backup, not deleting migration history.

For the first empty academic database only, explicitly set `ALLOW_DEMO_SEED=true` and a private `DEMO_PASSWORD` of at least 12 characters, then run `npm run db:seed`. Production seeding rejects a nonempty user table and runs transactionally. Remove both bootstrap variables afterward. Existing local reseeding behavior is unchanged. Use admin tools to manage subsequent accounts; never publish the shared bootstrap password or local `.env`.

`GET /health` checks PostgreSQL and returns only `{"status":"ok"}`; failures return a generic 503. Configure host health checks there. Swagger is disabled in production. Back up and restore database plus evidence together; no retention job or multi-instance storage is implemented.

## Publish sequence

1. Review `git diff` and the pre-existing local UI/mobile work. Do not stage `.env`, `.tools`, database dumps, private uploads or credentials. Commit the intended source changes, then `git push origin main` to the existing remote. Review/merge a deployment branch first if preferred.
2. In the rsibanda Netlify team, import `rsibanda/zrp-smart-traffic` from GitHub and use the settings above. Choose its final site name to obtain the HTTPS origin. A team URL is not the site URL or API URL.
3. Provision the backend service, managed database and persistent evidence volume. Configure backend variables, run the build and migration release job, optionally bootstrap the empty academic database, then start the API.
4. Set backend `CORS_ORIGIN` to the actual Netlify site origin. Set Netlify `VITE_API_URL` to the actual healthy backend origin.
5. Deploy/redeploy Netlify. Verify the root and `/admin` directly and on refresh. Confirm browser requests reach the remote API, never localhost.
6. Run the verification below before calling deployment complete. Keep preview deployments off the production API unless their exact origin is explicitly approved in CORS; avoid wildcard preview origins.

Authenticated Netlify access, a selected site, and a provisioned backend/database are still required. The supplied team link alone does not grant deployment access. No GitHub push or live deployment has been performed by these instructions.

## Verification

Local commands (repository root; Node 22 on PATH):

```sh
npm ci
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Use a disposable local database for `npm run test:integration` and `node scripts/check-fresh-database.mjs`; never point these tests at the hosted dataset. Fresh-schema checks apply all migrations and seed in an isolated schema and remove only that schema.

Local development: copy `.env.example` to `.env`, choose private local database/bootstrap passwords, then run `docker compose up -d --wait`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, and `npm run dev:api`. In a second terminal run `npm run dev:dashboard`. The prepared Windows workspace can instead enable tools with `Set-ExecutionPolicy -Scope Process Bypass`, `. ./scripts/use-local-tools.ps1`, and `./scripts/start-local-db.ps1` as documented in README.

Production web build (PowerShell, with the real host substituted):

```powershell
$env:VITE_API_URL = 'https://YOUR-BACKEND-HOST'
$env:NETLIFY = 'true'
npm run build:web
```

Production API build: `npm ci` then `npm run build:api`; after configuring backend environment and applying migrations, `npm run start:api`.

On the deployed system verify all four roles: admin account/category/audit access; assigned supervisor review/incidents/checkpoints; officer vehicle lookup, draft, evidence and idempotent ticket issuance; motorist reference plus code, payment simulation, notices and report submission. Confirm the newly issued ticket is visible to its reviewer and verified motorist without reseeding. Check logout/expiry, forbidden actions, anonymous evidence/vehicle denial, oversized uploads, network failure, and disallowed-origin CORS responses. Upload evidence, restart/redeploy the backend and download it again to verify volume persistence. These hosted checks remain pending until real hosting is available.

## Verification results for this change

- `npm run typecheck`, `npm run lint`: passed.
- `npm test`: 41 API tests and 6 web tests passed.
- `npm run test:integration`: 18 PostgreSQL integration tests passed, covering staff roles, ticket isolation and private evidence.
- `node scripts/check-fresh-database.mjs`: all migrations and seed passed on a fresh isolated schema; existing demo records preserved.
- Prisma schema validation, `npm run build`, `npm run build:api`, and `npm run build:web` with Netlify mode and a synthetic HTTPS origin: passed. The synthetic origin validates compilation only; it is not a deployed service.
- Targeted Prettier checks and `git diff --check`: passed. Existing unrelated UI/mobile changes were preserved.
- Tracked-file check found no local secret values or tracked environment/private-storage/key/dump files. This is a focused check, not a guarantee about all historical credentials.
- Docker engine unavailable (`dockerDesktopLinuxEngine` pipe absent); container build and hosted volume persistence remain unverified.
- No authenticated Netlify access or backend/PostgreSQL hosting supplied. GitHub push, Netlify publishing and live four-role browser checks remain pending.

## Netlify access and configuration update

Authenticated access was verified for team `rsibanda`. Existing site `thunderous-moxie-b0872a` is connected to `rsibanda/zrp-smart-traffic`, branch `main`. Its build settings are now base `.`, command `npm run build:web`, and publish directory `apps/dashboard/dist`. No new deployment was triggered. The existing published site is not evidence that the updated application works end-to-end.

`VITE_API_URL` is not configured on the site. The deployment source changes still need to be committed/pushed, and a healthy HTTPS backend with managed PostgreSQL and persistent evidence storage is still required. Netlify authentication is no longer the immediate blocker; backend hosting is. The access token was used only for API requests and was not saved in this project. Revoke the chat-shared token after setup.

## Render and Neon continuation

Neon CLI 6.4.0 and the CLI-selected project skills were installed. `.neon` is ignored. Neon login was started and requires browser completion; MCP installation reported authentication required. Linking project `fancy-mouse-12186125`, branch `production`, config initialization and deployment remain pending authentication and inspection of the existing branch.

The requested deployment credentials were absent from the process, Windows user and machine environment. Under the environment-only credential rule, chat-pasted credentials were not used. Render service inspection and deployment require RENDER_API_KEY; frontend deployment requires NETLIFY_AUTH_TOKEN. Prefer a hosted DATABASE_URL or Neon authentication for PostgreSQL; Supabase account management is unnecessary for this database-only integration. No hosted database mutations or Render resource changes were made in this continuation.

## Deployment continuation — 1 October 2026

Deployment credentials remain absent from process, Windows user and machine environments; no saved Neon CLI credential was found. Hosted service inspection/deployment is blocked. No cloud resources were changed during this check.

Run the following locally in your own PowerShell window, using rotated credentials at the hidden prompts:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\set-deployment-credentials.ps1 -PersistUserEnvironment
```

This prompts for `RENDER_API_KEY`, `NETLIFY_AUTH_TOKEN` and `NEON_API_KEY`. To use an existing hosted PostgreSQL connection instead of Neon management access, add `-UseDatabaseUrl`; the third prompt becomes `DATABASE_URL`. Values are never written to project files or echoed. The persistence flag stores values in the Windows user environment until removed; without it, values exist only in the current shell and child applications. An existing agent process may need to load the named user-scope values explicitly or be restarted. Do not overwrite the local development `.env` with hosted credentials.

The helper passed PowerShell syntax validation. Interactive credential entry and hosted deployment have not yet been performed.

## New project request — 1 October 2026

The user clarified that this app has no Neon or Render project and authorized creation of the necessary resources. Do not assume the previously supplied Neon project ID belongs to this app. Inspect authenticated account resources before reuse or creation.

Proposed resources:

- Neon project `zrp-smart-traffic`: PostgreSQL for the existing Prisma schema, production branch, Free plan if the account allows it. Obtain the connection securely after creation; no pre-existing DATABASE_URL is required.
- Render project `zrp-smart-traffic` with one web service `zrp-traffic-api`, connected to the existing GitHub repository. Match its region to the database where possible. Use the current Dockerfile or native Node build, /health checks, and private persistent evidence storage.
- Reuse the existing Netlify site rather than creating a duplicate frontend.

Render Free web services cannot attach persistent disks. Preserving the existing disk-backed evidence implementation requires a paid compute plan plus disk. Obtain a current account-specific quote and user approval before creating paid resources; alternatively, propose a separately reviewed object-storage change if zero-cost hosting is required. Do not silently deploy evidence to ephemeral storage.

Creation remains pending: Render, Neon and Netlify credentials are absent from process and Windows user/machine environment, and no saved Neon authentication was found. Account-level API keys can be created before an application project exists. Run scripts/set-deployment-credentials.ps1 -PersistUserEnvironment to enter them at hidden prompts; a database URL is not needed for this flow. No cloud resources were created during this check.

Reference: https://render.com/docs/free

Credential follow-up: the three Windows user environment variables are now present, but contain non-ASCII, implausibly short values. HTTP clients reject them locally; this was not a provider authentication response. Added validation to the credential helper to reject malformed input before saving. Syntax and synthetic secure-value conversion checks passed. No real credential values were printed and no hosted resources were changed. Valid raw keys must be entered again before account inspection or project creation can proceed.

Credential input diagnosis: each saved deployment credential contained only the Ctrl+V control character, not an API key. Added `-Gui` to the setup helper to use masked Windows text boxes with normal paste support. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-deployment-credentials.ps1 -PersistUserEnvironment -Gui` from the project folder. Syntax and masked input construction checks passed; interactive paste and provider authentication remain pending. No cloud resources changed.

## Hosted database created — 1 October 2026

All three provider credentials authenticated successfully after correcting input. The Neon personal API key requires the organization ID when listing projects.

Created the app-specific Neon project on the existing Free-plan organization:

- Name: `zrp-smart-traffic`
- Project: `noisy-brook-51882053`
- Organization: `org-wandering-term-56705045`
- Region: `aws-eu-central-1` (Frankfurt)
- PostgreSQL: 16
- Branch: `production` (`br-summer-art-b1guyqmt`)
- Database: `neondb`

The earlier `smart` project (`fancy-mouse-12186125`) was preserved. All committed Prisma migrations applied successfully to the new database via its direct connection. The URL was kept in transient process memory/environment and was not written to this repository. Demo accounts have not yet been seeded.

Render workspace `tea-dau1clfavr4c73faeu40` (`My Workspace`) currently has no services. Prepared `render.yaml`: native Node 22 backend in Frankfurt, 0.5 CPU/512 MB compute, 1 GB persistent evidence disk, /health check, existing Netlify CORS origin, and DATABASE_URL provided separately as a secret. No automatic seeding or automatic deployments are configured.

Render's read-only Blueprint validation returned two blockers: `need_payment_info` and `branch main could not be found`. The account needs a payment method for paid compute/storage and GitHub access to `rsibanda/zrp-smart-traffic` with its main branch. No paid service has been created. Proposed baseline cost is $7/month compute plus $0.25/month for 1 GB disk, before taxes/additional usage; user cost approval remains pending. Sources: https://render.com/pricing and https://render.com/docs/disks .

Next: obtain paid-plan approval, configure Render billing and repository access, revalidate the Blueprint, push reviewed deployment source, create the backend with its secret database URL, explicitly bootstrap fictional accounts, verify /health and four-role flows, then set the Netlify API URL and redeploy. Existing Netlify site is unchanged in this continuation.
