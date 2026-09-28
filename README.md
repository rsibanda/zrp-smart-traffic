# ZRP Smart Traffic Management System

**DEMO / UNIVERSITY PROTOTYPE.** Fictional records only. This project is not an official ZRP system and has no connection to government databases. The UI uses a small **Academic Prototype** footer. Tickets have no legal validity; payment processing remains simulated. Amounts are invented training units, not legal tariffs or currency claims.

## Current increment

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

The bootstrap script preserves the supplied source while generating Android runner files. It permits local HTTP in the **debug** manifest only. The Android emulator uses `10.0.2.2` to reach the host loopback API. A physical device needs an explicitly configured reachable host and firewall rule; that setup has not been verified. Do not expose this prototype to the internet.

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

The login page has exactly three categories: **User**, **Officer** and **Supervisor**. Select the category matching your account. Motorist services appear only after **User** sign-in; ticket access still requires its reference and separate verification code. The existing administrator tools are retained at **http://localhost:5173/admin**, outside the three-category login. Administrators can create and manage USER accounts; no public self-registration is provided. All demo accounts use `DEMO_PASSWORD` from the ignored local `.env` file.

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

Integration tests create fictional test offences, check simultaneous submission and ownership/review boundaries, then remove only those test offences/tickets and their related audit events. Login audit entries remain. Use a disposable demo database. No production database is supported.

## Limitations and retention

Draft retry keys and unique offence-to-ticket constraints prevent duplicates while the same key/ID is reused. Pending mobile requests are held in memory only: after app termination or session expiry, sign in and inspect recent activity before starting another draft. Encrypted offline persistence is deferred. Drafts support revision-checked editing and audited discard. One-time GPS capture requests permission only on an explicit tap; manual locations remain available. Evidence images can be selected or captured in Flutter and uploaded from draft details on the web.

All officers may look up seeded fictional vehicles; only record ownership permits offence/ticket reads. Supervisors see only assigned submitted records. Administrators explicitly assign officers to active supervisors. Reassignment transfers unfinished offences and incidents. Unverified public reports go to the first active supervisor by email as a classroom simplification. Admins do not receive operational record access by default.

No automated retention policy exists yet. `docker compose down` preserves the database. **Only when you intend to erase all local demo records**, `docker compose down -v` removes this Compose project's database volume. Never run it against work you want to keep. Evidence is stored privately in ignored `.storage/evidence`. Database reset does not delete these files; remove them only when intentionally clearing the matching demo dataset. No automatic retention job runs.

See [decisions](docs/decisions.md), [API contract](docs/api.md) and [implementation checklist](docs/02-requirements.md). Domain rules and university assessment requirements remain **TO VERIFY**; no course rubric was supplied.
