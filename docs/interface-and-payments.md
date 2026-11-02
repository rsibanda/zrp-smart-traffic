# Role interfaces and simulated payments — 2 October 2026

## Repository assessment

The existing workspace remains a React/TypeScript/Vite dashboard, Flutter Android client and NestJS API using Prisma 6/PostgreSQL. Server-managed, hashed bearer sessions expire after 30 minutes; roles remain USER, OFFICER, SUPERVISOR and ADMIN. Web login is at `/`, administrator login at `/admin`; API routes retain `/api/v1`. The Android login retains User, Officer and Supervisor. No authentication provider, driver or framework was replaced.

Before this increment, motorists could verify one ticket with its random reference and separate code, simulate a payment and report incidents. Vehicles had driver links but no motorist-account ownership. Tickets had immutable amount snapshots and a legacy `PublicTicketAccess.paidAt` payment marker. There was no payment attempt history, account ledger, demerit catalogue or due-date model. Officer drafts, evidence, idempotent submission, assigned supervisor review, checkpoints, public notices, role checks and audit logging were retained.

Netlify and Render configuration is already present; hosted configuration uses Neon services. Local `.env` targets loopback PostgreSQL. All migration and integration checks for this increment use local PostgreSQL; hosted services are not modified or deployed. Existing CORS, health, storage and environment configuration remains intact.

## Implementation checklist

- [x] Add additive ownership/payment schema and migration.
- [x] Preserve secure reference/code access and legacy paid markers.
- [x] Implement motorist account ledger, vehicles, own reports and payment history.
- [x] Implement local EcoCash, InnBucks and card outcomes, idempotency and receipts.
- [x] Add web citation creation/review and mobile final-issue confirmation.
- [x] Expose configurable reference points and due periods to administrators.
- [x] Add assigned supervisor payment filters/status to web and Android.
- [x] Add automated ownership, retry, outcome and client workflow tests.
- [x] Inspect motorist account and receipt/export on Pixel_8.
- [ ] Complete browser visual verification (blocked; see validation notes).

## Ownership and migration

`20261002140000_motorist_payments` adds nullable `Vehicle.motoristId` and `Ticket.motoristId`, ticket points/due date, category points/due period and a Payment entity. It preserves existing rows, identifiers, enum values and relations. New links have foreign keys and indexes; points/due days have check constraints. A partial unique index permits at most one SUCCESS payment per ticket.

Administrators explicitly link a known registration to an active USER account through `POST /admin/motorist-links`. Future ticket submissions snapshot that account. Changing a vehicle's account never transfers historical tickets. An unlinked historical ticket can be claimed only through the existing random reference AND verification code. This claims that ticket, not its vehicle. Once linked, another account cannot verify or access it. Motorist identity always comes from the authenticated session, never the request body.

Existing historical tickets retain zero points and no due date because no reliable historical values exist. Old paid markers remain authoritative. When an older paid ticket is verified, its receipt is represented as a LEGACY payment; no provider name is invented. The previous ticket-payment endpoint remains compatible and writes the same payment history. Existing ticket access tokens are still checked against their parent account session and ticket owner.

Development seeding adds six configurable sample offence categories, preserves edited categories and existing records, and links only the known synthetic ABC1234/L0001042 development vehicle to the seeded motorist if unassigned. It does not infer identity from matching names. The existing seed routine revokes seeded-account sessions and retains the locally configured password.

## Rules and simulated payment architecture

The subsequent UI/data refinement explicitly changes synthetic amounts to USD display without changing their numeric values. See [UI/data refinement](ui-data-refinement.md). Catalogue values are academic configuration, not official Zimbabwe tariffs. New tickets snapshot amount and points and calculate due date using the category's configurable 1–365 day period (default 30). Paid tickets retain points; cancelled tickets contribute zero. Enforcement review status and payment status remain separate. Overdue means an unpaid active ticket with a stored past due date, calculated on the server.

`PaymentsService` uses a local `PaymentProvider` implementation shared by the three selectable methods. It has no network transport, payment SDK, provider credentials, webhooks, SMS or USSD. Explicit outcomes are approval, decline, timeout, processing error and cancel. The stored lifecycle is PROCESSING → SUCCESS/FAILED/TIMED_OUT/CANCELLED. An abandoned attempt expires after 15 minutes when resolved or replaced. Only SUCCESS creates a receipt and updates the legacy paid marker, in the same serializable transaction as the audit records. Duplicate outcomes return the stored terminal state. An already paid/cancelled ticket cannot be paid again; concurrent approval is guarded by serializable retries and the database uniqueness constraint.

Both clients retain the initiation UUID across uncertain network retries. A processing attempt can be resumed from Payment History after navigation/restart. UI fields accept supplied test details only. The API receives method, request key, ticket reference and (for CARD) `last4=4242`; raw card number, CVV, cardholder name, phone number, amount and motorist identity are never sent. Unknown fields are rejected. No sensitive payment input reaches storage or audit metadata.

Receipts include account name, registration, ticket, offence, amount, method, transaction and receipt references, timestamp and an explicit no-funds-transferred notice. Web supports text download and browser print/save PDF. Android uses the system document picker for text download and Android printing/save PDF without a new dependency. Receipt APIs are owner-only.

## API additions (all under `/api/v1`)

| Method | Route                                   | Access                            |
| ------ | --------------------------------------- | --------------------------------- |
| GET    | `/motorist/dashboard`                   | USER, own totals                  |
| GET    | `/motorist/infringements`               | USER, paginated own tickets       |
| GET    | `/motorist/infringements/:reference`    | USER, own detail/history          |
| GET    | `/motorist/vehicles`                    | USER, paginated assigned vehicles |
| GET    | `/motorist/incidents`                   | USER, own submissions only        |
| GET    | `/motorist/payments`                    | USER, paginated own attempts      |
| POST   | `/motorist/payments`                    | USER, owned payable ticket        |
| POST   | `/motorist/payments/:reference/outcome` | USER, owned attempt               |
| GET    | `/motorist/payments/:reference/receipt` | USER, successful owned attempt    |
| POST   | `/admin/motorist-links`                 | ADMIN, explicit verified link     |

`/offences` accepts an additive `paymentStatus` filter (PENDING, PAID, OVERDUE, FAILED). It retains officer ownership/supervisor assignment scope. Operational details expose only payment status/method/time, not unrestricted motorist history. Admins retain configuration/audit access and do not gain operational records. Swagger response contracts cover the new routes. No browser URL routes were replaced; new sections use existing role workspaces.

## UI changes

Web motorists get overview cards, paginated infringement cards/details, timeline, payment history/resume, receipts, registered vehicles, own incidents, notices/reporting and profile information. The reference images guide card layout and information hierarchy; browser/Google chrome and arbitrary severity sliders are not copied. Navy navigation, teal actions, white surfaces and text-labelled status badges remain consistent.

The web officer terminal adds manual lookup, driver/account summary, catalogue amount/points/due period, draft creation, existing evidence upload and confirmation before ticket issue. Existing draft editing/discard/history remains available. Android adds the same account ledger and simulation methods, receipt export, fine/point previews and final confirmation. Supervisor lists in both clients show payment status and filters; web also shows latest method/time. Polling refreshes authorised records (web account/staff lists 10 seconds; Android account ledger 10 seconds, supervisor lists 30 seconds).

## Validation and limits

See the final validation record below for executed commands. Automated coverage includes all three methods, success/failure/timeout, duplicate concurrent initiation/completion, foreign-account ticket/payment/receipt denial, verified claims, expiry, cancellation, no sensitive input persistence, balance updates and supervisor visibility. Existing authentication, incident, evidence and review tests remain in the suite. New client tests cover payment retries, safe card payloads and final officer confirmation.

No in-app notification infrastructure existed, so this increment retains polling rather than claiming push/SMS delivery. Evidence remains restricted to existing staff permissions; motorists do not receive raw evidence. Existing incident/checkpoint transition models remain unchanged. Android retains its existing notices/reporting section below the ledger; administrator management remains on the web. Native receipt export was verified on Pixel_8; other Android versions remain untested. No official tariffs, demerit expiry/licence consequences, real currency/payment gateways or automatic vehicle-ownership verification are claimed. These domain rules remain **TO VERIFY** before any operational deployment.

Deployment: back up and test the migration on an isolated Neon branch using a direct connection before deploying the API, then deploy the web bundle and distribute the new APK. Do not run the development seed on a populated hosted database. No hosting secrets or frontend environment settings were added or changed. A later milestone can add verified operational rules and a separately authorised real-payment integration.

## Files in this increment

- Backend: `prisma/schema.prisma`, additive migration, `prisma/seed.ts`; new `payments.service.ts`, `motorist.controller.ts`, `payments.spec.ts`, payment integration tests; updates to module, offence service/query, public-ticket controller, admin controller/category DTOs and response contracts.
- Web: new `MotoristDashboard.tsx`, `CitationTerminal.tsx` and tests; existing App, PublicPortal, AdminPanel, presentation CSS, test setup and Vite test configuration.
- Android: new `motorist_ledger.dart` and payment tests; main/role workspace/presentation and existing role/workflow tests; MainActivity receipt export bridge.
- Documentation: this report, API/setup/mobile README and decisions.

## Executed validation

- `npm run lint`: passed.
- `npm run typecheck`: API and web passed.
- `npm test`: 47 API unit tests and 9 web tests passed (the new citation test was corrected to target the visible vehicle heading, then the web suite was rerun successfully).
- `npm run test:integration`: 31 real PostgreSQL tests passed across four suites.
- `npm run build`: NestJS build and Vite production build passed; Netlify's existing `build:web` target uses the same web build script.
- `node scripts/check-fresh-database.mjs`: all seven migrations and the updated seed passed in a disposable isolated schema; existing data preserved.
- `flutter analyze`: no issues. `flutter test`: 7 tests passed, including all three methods at a 390-pixel viewport, retained request keys, safe payloads and existing account/officer/supervisor flows.
- `flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1`: passed, including the native receipt bridge.
- Local `/health`: `ok`; dashboard HTTP 200; CORS allowed the configured `http://localhost:5173` origin.
- `node scripts/check-account-payments.mjs`: actual local officer issue → motorist linkage → simulated card approval → receipt → supervisor paid visibility passed. Two synthetic acceptance records remain in the local account (one pending, one paid); the script reuses stable request keys.
- Pixel_8: APK installed and launched; User login, live 150-unit outstanding balance, four points, two infringements, payment history and receipt inspected. Android print UI opened successfully; receipt text saved into the emulator's Downloads folder using the system picker. The mobile review prompted a final equal-height metric-card adjustment and removal of the debug ribbon.
- Automated headless Chrome launch was rejected by automatic approval review (`blocked by policy`). Browser viewport/axe/print visual checks therefore remain incomplete; no browser visual pass is claimed. No hosted deployment or live Neon migration was performed.

The terminology scan found preserved internal identifiers (`demoFineAmount`, `demoFineAmountSnapshot`, `demoAmount`, `DemoMap`, `DEMO_ALERT_*`, settings key `demo`) and historical/test/documentation text. These stay for compatibility and audit continuity; visible labels use operational wording. Payment confirmations/receipts explicitly state that no funds are transferred, and the global footer remains Academic Prototype.

Final Android review build: formatting, analysis and all seven Flutter tests passed again after the metric alignment change. The APK was rebuilt successfully. `git diff --check` passed; the final source lint and API compilation passed. Browser visual verification remains the only blocked validation item.
