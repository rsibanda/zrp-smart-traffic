# ZRP Smart Traffic Management System

**DEMO / UNIVERSITY PROTOTYPE.** Fictional records only. This project is not an official ZRP system and has no connection to government databases. The UI uses a small **Academic Prototype** footer. Tickets have no legal validity; payment processing remains simulated. Amounts use USD formatting for simulated payments; they are not official tariffs or evidence of legal settlement.

## Current increment

The 31 October offence catalogue update adds ten configurable demonstration penalties and verifies immediate citation calculations and consistent issued-ticket snapshots. See [catalogue values, migration and verification](docs/offence-catalogue-2026-10-31.md). Existing tickets and driver-point history are preserved; apply migrations without reseeding accounts.

The 30 October increment adds secure ticket QR verification, private vehicle applications with supervisor decisions, configurable application fees and payment simulation, and a verified-driver remaining-points ledger. See [setup, workflows and security decisions](docs/ticket-applications-points.md) and [validation status](docs/remaining-work-2026-10-30.md). The interface notice is **Academic Prototype — No real payments or enforcement**. New hosted/device acceptance remains pending; these changes have not been published.

The repository began with only `AGENTS.md`; its wording is preserved. The project uses the current folder as the repository root instead of nesting another `zrp-smart-traffic` directory.

Implemented source: NestJS API with PostgreSQL/Prisma migration and fictional seed, Argon2id sign-in, revocable 30-minute sessions, exact fictional vehicle lookup, own draft creation, idempotent ticket submission, assigned supervisor review and transactional audit history. The React client signs in, lists permitted records with polling, opens tickets and submits reviews. Flutter source includes officer sign-in, lookup, draft preview, submission and recent activity.

PostgreSQL migrations, fictional seed data, API integration tests and the real browser supervisor workflow have been verified locally. See [testing and evaluation](docs/04-testing-and-evaluation.md) for individual check results and Android verification status. Incidents, checkpoints, OSM maps, supervisor analytics, private evidence, account/category management, public ticket verification, payment simulation, public alerts and road reports are implemented. See the four-role feature matrix below. OpenAPI documents routes, validated request DTOs and explicit safe response schemas.

## Local setup (PowerShell)

### This prepared workspace

Portable tools are installed under ignored `.tools`; they are not included in source control. The existing ignored `.env` contains randomly generated local credentials. Open that file locally to read `DEMO_PASSWORD`; do not commit or share it.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
. .\scripts\use-local-tools.ps1
.\scripts\start-local-db.ps1
npm run db:generate
npm run db:migrate
npm run dev:api
# In a second terminal, enable the tools again, then:
npm run dev:dashboard
```

The portable database is the same PostgreSQL engine used by Compose, bound only to loopback. It avoids requiring Docker Desktop on this machine. Its data lives in `.tools/postgres-data`. Reseed only when needed with `npm run db:seed`; this revokes demo sessions.

### Another development machine

Install Node.js 22 LTS, Docker Desktop with Compose, and Flutter with an Android SDK/emulator. Run `flutter doctor` and resolve Android toolchain issues. npm is the package manager.

```powershell
Copy-Item .env.example .env
```

Edit `.env`: choose your own alphanumeric `POSTGRES_PASSWORD`, put that same password into `DATABASE_URL`, and choose a `DEMO_PASSWORD` of at least 12 characters. These values stay local and must never be committed. For passwords with special URL characters, URL-encode the password portion of `DATABASE_URL`.

```powershell
npm ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:api
```

In a second terminal at the repository root:

```powershell
npm run dev:dashboard
```

Dashboard: http://localhost:5173. API documentation: http://127.0.0.1:3000/api/docs. Swagger accepts the login response `token` through its **Authorize** button. The API uses `/api/v1`. No refresh token is issued; sign in again after 30 minutes. Server-managed sessions are revoked on logout; browser/mobile tokens are held in memory only.

Demo emails (all use your locally chosen `DEMO_PASSWORD`):

| Email                              | Role                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| user@demo.invalid                  | User (motorist account)                                     |
| officer@demo.invalid               | Officer                                                     |
| officer2@demo.invalid              | Second officer for ownership testing                        |
| supervisor@demo.invalid            | Assigned demo reviewer                                      |
| unassigned-supervisor@demo.invalid | Unassigned reviewer for permission testing                  |
| admin@demo.invalid                 | Accounts, assignments, categories, settings, security audit |

Plate: `ABC1234`. `abc-1234` is normalised to the same value. An unknown plate returns no result; omitting the registration query is rejected. Seed is repeatable and preserves existing traffic records. Reseeding updates demo passwords and revokes their sessions.

### Android officer app

This workspace now prefers Android Studio's SDK at `%LOCALAPPDATA%/Android/Sdk` over the old portable SDK. Flutter and VS Code are linked to the workspace Flutter SDK; `.vscode/launch.json` supplies the emulator API address. Restart VS Code if it still shows the old SDK.

On this machine the **Pixel_8** AVD exists, but Windows emulator acceleration is not enabled. In **PowerShell as Administrator**, run once:

```powershell
cd "C:\Users\rr\Desktop\ZRP Traffic"
powershell -ExecutionPolicy Bypass -File scripts/enable-emulator-hypervisor.ps1
```

Save your work and restart Windows yourself. The helper never restarts the machine automatically. Then use a normal PowerShell at the repository root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\start-demo.ps1
.\scripts\start-officer.ps1
```

`start-demo.ps1` starts the local database, API and dashboard, preserving data. `start-officer.ps1` checks acceleration, launches Pixel_8 and connects the officer app to `http://10.0.2.2:3000/api/v1`. The dashboard is at `http://localhost:5173`. You can also choose **Officer app (Android emulator)** in VS Code Run and Debug. See [Android's emulator acceleration guidance](https://developer.android.com/studio/run/emulator-acceleration#vm-windows).

On another development machine, generate the Android runner only if absent:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/init-mobile.ps1
cd apps/officer-mobile
flutter analyze
flutter test
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Build without a running emulator using `flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1` from `apps/officer-mobile`. Output: `apps/officer-mobile/build/app/outputs/flutter-apk/app-debug.apk`.

The bootstrap script preserves the supplied source while generating Android runner files. It permits local HTTP in the **debug** manifest only. The Android emulator uses `10.0.2.2` to reach the host loopback API. A physical device needs an explicitly configured reachable host and firewall rule; that setup has not been verified. For public academic hosting, use the separate HTTPS deployment configuration in DEPLOYMENT.md; do not expose the local development servers.

### Demonstrate the slice

1. Sign in on Android as `officer@demo.invalid` and find `ABC1234`.
2. Select the fictional category, enter a manual location and fictional notes, then save a draft.
3. Check the preview and issue the demo ticket. After a timeout, use the retry button for the same draft.
4. Sign in on the dashboard as `supervisor@demo.invalid`. The submitted record appears within 10 seconds.
5. Open it, move it to `UNDER_REVIEW`, then `CONFIRMED` or `CANCELLED` with notes.
6. Refresh officer activity to see the review result. Use the second officer to verify the record cannot be read by changing its ID.

Without Android, use Swagger to exercise the same API: login, find the vehicle, fetch category IDs, POST a draft with a freshly generated UUID `requestKey`, then submit its ID. Reuse the key and unchanged payload on draft retries.

## Checks

### Four-role feature matrix

| Role            | Available demo functions                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator   | Create/edit/disable accounts, assign roles and supervisors, configure offence categories and public notice, inspect permissions, active sessions, failed sign-ins and audit history           |
| Supervisor      | Assigned offence reviews and incident resolution, officer activity counts, checkpoint creation/activation/closure, fictional OSM markers, seven-day analytics, publish/withdraw public alerts |
| Officer         | Fictional vehicle and driver-status lookup in Flutter, draft offences, private gallery/camera evidence, demo tickets and motorist access codes, accident/incident reporting and own activity  |
| Public/motorist | Reference + separate code verification, limited ticket details/status, idempotent payment simulation and demo receipt, polling traffic alerts, unverified road reports                        |

The login page has exactly three categories: **User**, **Officer** and **Supervisor**. Select the category matching your account. Motorist services appear only after **User** sign-in; ticket access still requires its reference and separate verification code. The existing administrator tools are retained at **http://localhost:5173/admin**, outside the three-category login. Administrators can create and manage USER accounts; no public self-registration is provided. Android also offers User, Officer and Supervisor account selection; see the mobile README for supported native workflows. Sign out before selecting another account type. All demo accounts use `DEMO_PASSWORD` from the ignored local `.env` file.

Supervisors use **Overview**, **Incidents** and **Checkpoints** above the existing offence list. Maps show only the current results page; click **View checkpoint map** or **View incident map** to load the attributed basemap. Checkpoints can activate only within their scheduled period.

For a public demo, the issuing officer opens a ticket and selects **Generate motorist verification code** (Flutter) or **Generate motorist access code** (web ticket details). Provide this code separately from the reference. Generation invalidates any previous code/public session. Public access expires after ten minutes and never opens vehicle, driver or evidence endpoints. Payments take no money; alerts update while the page is open, with no SMS/push service.

Evidence is JPEG/PNG only, at most 5 MB and 20 million decoded pixels, maximum five images per draft. The server decodes and re-encodes images to JPEG, removing metadata. Submit after attaching evidence; submitted evidence is immutable. Retrying the same image deduplicates its processed content.

```powershell
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
# Requires migrated and seeded PostgreSQL, using the local .env:
npm run test:integration
```

Integration tests create fictional test offences, check simultaneous submission and ownership/review boundaries, then remove only those test offences/tickets and their related audit events. Login audit entries remain. Use a disposable demo database. These test commands must never target the hosted database.

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the GitHub → Netlify frontend and separate NestJS/PostgreSQL deployment. Netlify uses base `.`, build `npm run build:web`, publish `apps/dashboard/dist`, Node 22 and the public `VITE_API_URL` backend origin. Configure backend secrets, persistent evidence storage and exact `CORS_ORIGIN` separately; apply migrations before startup, then redeploy the frontend with the healthy backend URL. No live deployment has been verified.

## Limitations and retention

Draft retry keys and unique offence-to-ticket constraints prevent duplicates while the same key/ID is reused. Pending mobile requests are held in memory only: after app termination or session expiry, sign in and inspect recent activity before starting another draft. Encrypted offline persistence is deferred. Drafts support revision-checked editing and audited discard. One-time GPS capture requests permission only on an explicit tap; manual locations remain available. Evidence images can be selected or captured in Flutter and uploaded from draft details on the web.

All officers may look up seeded fictional vehicles; only record ownership permits offence/ticket reads. Supervisors see only assigned submitted records. Administrators explicitly assign officers to active supervisors. Reassignment transfers unfinished offences and incidents. Unverified public reports go to the first active supervisor by email as a classroom simplification. Admins do not receive operational record access by default.

No automated retention policy exists yet. `docker compose down` preserves the database. **Only when you intend to erase all local demo records**, `docker compose down -v` removes this Compose project's database volume. Never run it against work you want to keep. Evidence is stored privately in ignored `.storage/evidence`. Database reset does not delete these files; remove them only when intentionally clearing the matching demo dataset. No automatic retention job runs.

See [decisions](docs/decisions.md), [API contract](docs/api.md) and [implementation checklist](docs/02-requirements.md). Domain rules and university assessment requirements remain **TO VERIFY**; no course rubric was supplied.

## Account ledger and simulated payment upgrade

Motorists now have linked infringements, balances, points, vehicles, their own incident reports, payment history and receipts on web and Android. Administrators manage verified vehicle/account links and configurable category points/due periods. Officers can issue infringements from either client. EcoCash, InnBucks and Bank Card are local simulations only; no real provider request is sent.

After pulling these changes, run `npm run db:generate`, `npm run db:migrate`, and rebuild/restart the API. For local development only, `npm run db:seed` adds the sample catalogue and links the known ABC1234 vehicle; it preserves records but revokes seeded-account sessions. Production migrations must first be tested on an isolated database branch. Do not seed a populated hosted database.

Test payment details: mobile `0770000000`; card `4242 4242 4242 4242`, expiry `12/30`, CVV `123`, name `Test Motorist`. These input values stay on the device. Only the test last four digits reach the API. Choose a simulated outcome after Continue; resume interrupted processing from Payments. Amounts display in USD for simulation only; no money is collected.

See [implementation, endpoints, security and validation](docs/interface-and-payments.md). Web receipts support download and print/save PDF; Android receipts use the system save/print dialogs. Existing unlinked tickets still require their reference and verification code. Changing vehicle ownership does not transfer historical tickets.

### Interface and account-data refinement

Amounts now use US$ currency formatting and tickets display readable INF references. Existing opaque lookup keys and verification codes still work. See [UI/data refinement](docs/ui-data-refinement.md) for the migration, ownership findings and validation results.

## My Vehicles

Motorists can request a vehicle link, view verified vehicle details and internal status, see account-scoped infringements/fine totals, edit a nickname and request unlinking when outstanding fines are resolved. Administrators review pending requests in **Vehicle Link Requests**. Entering a plate never grants ownership. The web and Android use the same API and existing account relationship. See [vehicle management](docs/vehicle-management.md) for workflow, migration and endpoint details.

### Supervisor command centre

Supervisor sign-in opens the refreshed command centre on web and Android. Inspect `/supervisor/dashboard`, `/supervisor/reviews`, `/supervisor/payments` and `/supervisor/vehicles`. On Android, vehicle approvals and payments are under More. Supervisors can now review motorist vehicle requests with ownership checks and confirmation; conflicting account ownership remains blocked. Update the API alongside both clients; no new migration or reseed is needed. Details and validation: [supervisor layout](docs/supervisor-reference-layout.md).
