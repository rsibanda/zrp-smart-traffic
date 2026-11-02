# Remaining work audit — 30 October 2026

Source: `SMART_TRAFFIC_REMAINING_WORK_CODEX.md` supplied by the user. This is an incremental extension of the current application, not a rebuild. The latest brief's prototype notice and branding take precedence over the original AGENTS.md's older demo-banner wording.

## Repository audit before implementation

| Requirement                                      | Initial state     | Evidence / remaining work                                                                                                                                                                               |
| ------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secure ticket QR issuance and scanning           | Missing           | Manual reference/code verification exists in `public.controller.ts`; no QR token model, generator or scanners.                                                                                          |
| Vehicle applications with private documents      | Partially working | `vehicle-accounts.ts` implements link/unlink requests. No vehicle metadata application, attachments, draft or changes-requested lifecycle. Private S3/local evidence storage exists for offence images. |
| Supervisor vehicle approval                      | Partially working | Existing scoped review UI and approve/reject link workflow. Needs application documents, new-vehicle creation and changes requested.                                                                    |
| Vehicle categories and fee snapshots             | Missing           | No category/fee/application payment models.                                                                                                                                                             |
| Offence categories and fine/points configuration | Already working   | Admin-only categories, server-authoritative fine/points snapshot at ticket issuance. Preserve existing configured records.                                                                              |
| Driver remaining-points ledger                   | Missing           | Motorist dashboard currently sums ticket points. No verified account–driver identity, debit ledger or compensating credits.                                                                             |
| Fine payment simulation                          | Already working   | EcoCash, InnBucks, Bank Card, receipts and account isolation in `payments.service.ts`. Application-fee simulation remains missing.                                                                      |
| Cross-role refresh                               | Already working   | Existing polling and ownership/assigned-supervisor filters; extend to new features.                                                                                                                     |
| Responsive layouts                               | Already working   | Existing role shells, safe-area navigation and layout tests; test the new forms/scanner too.                                                                                                            |
| New feature security / hosted acceptance         | Missing           | Add regression tests; physical second-device scan and hosted workflow need explicit evidence.                                                                                                           |

## Implementation checklist

- [x] Secure QR issue/rotate/revoke, limited public status, entitled account lookup, web/Android scan controls and manual fallback. Physical camera acceptance remains below.
- [x] Vehicle application draft, required metadata, private uploads and submission.
- [x] Supervisor decisions, reason/history and verified association on approval.
- [x] Vehicle catalogue configuration, submitted fee snapshots and simulated application payments.
- [x] Verified responsible-driver identity and idempotent points ledger with audited cancellation credit.
- [x] Local cross-role API regression checks, native responsive validation and web/API production build.
- [x] Android debug APK built with emulator API URL `http://10.0.2.2:3000/api/v1`.
- [ ] Hosted deployment, live private S3 acceptance, browser visual acceptance and second-device camera/QR acceptance.

## Verification performed

| Check                                                         | Result                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                                | Passed                                                                                                                                                |
| `npm run typecheck`                                           | Passed API and dashboard                                                                                                                              |
| `npm run test -w apps/api`                                    | 52 unit tests passed                                                                                                                                  |
| `npm run test:integration`                                    | 50 tests / 8 suites passed against local PostgreSQL                                                                                                   |
| `npm run test -w apps/dashboard`                              | 28 tests / 12 files passed                                                                                                                            |
| `npm run build`                                               | API TypeScript and Vite production builds passed                                                                                                      |
| `flutter analyze`                                             | No issues                                                                                                                                             |
| `flutter test`                                                | 27 passed; includes vehicle form validation and tappable Save at 375/390/430 px                                                                       |
| `node scripts/check-ticket-qr-roundtrip.cjs`                  | Real generated PNG decoded to its exact HTTPS URL using the web scanner worker                                                                        |
| `scripts/check-fresh-database.mjs` (guarded local invocation) | All 13 migrations and seed passed in a disposable local schema; existing records preserved                                                            |
| Running local API smoke check                                 | Existing admin/officer/supervisor/user credentials authenticated, authorised screen APIs returned 200, sessions logged out                            |
| Running frontend HTTP check                                   | `http://127.0.0.1:5173` serves the application                                                                                                        |
| Native rendered layout review                                 | Captured and visually inspected the 390 px motorist screen from the widget harness; remaining-points card, prototype notice and bottom navigation fit |

Integration coverage includes valid/expired/revoked QR tokens, anonymous data minimisation, wrong-account denial, private signed document access, PDF/JPEG/PNG validation, oversized files, changes requested/resubmission, approval idempotency, rejection reasons, ownership conflict protection, all three application payment successes and declined retries. Points tests cover 12→9, concurrent issue retry, payment independence, one cancellation credit, full debits below zero, pending identity, and legacy tickets without retrospective deductions.

Browser UI tests use a DOM harness; they do not establish real-browser camera or layout acceptance. Android widget tests use fake transport and do not establish physical capture. No emulator/phone was attached during the device check. The public QR origin is not configured in the current local `.env`; the manual fallback is intentional until issuing/scanning clients share a deployed backend.

The Android debug APK build passed after Gradle finished downloading dependencies (750.8 seconds). Output: `apps/officer-mobile/build/app/outputs/flutter-apk/app-debug.apk`.

The previously deployed site's login smoke check failed at ADMIN login. A follow-up safe status check returned HTTP 401 for the stored hosted administrator credential; the allowed-origin CORS header was correct. No password was reset and no hosted data was changed. This is separate from the successful four-role local login check and must be resolved before hosted acceptance.

## Changed files and deployment notes

- API: new `ticket-qr.ts`, `application-files.ts`, vehicle-application controller/service/DTO, `driver-points.ts`; extended offence issuance/cancellation, motorist summaries, existing vehicle requests, storage adapter, OpenAPI and module wiring. Added four Prisma migrations and unit/integration tests.
- Web: new `TicketQr`, `VehicleApplications`, `DriverPoints` components and tests; integrated them into existing citation, motorist, approval and administrator screens; multipart transport and restrained responsive styles.
- Android: matching `ticket_qr.dart`, `vehicle_applications.dart`, `driver_points.dart`; integrated existing officer/motorist/supervisor screens, private multipart transport, camera permission and shared prototype notice. Updated regression tests and added responsive application/driver tests.
- Configuration/documentation: `.env.example`, package manifests/lockfiles, QR round-trip script, README, API/deployment notes and [workflow/security/retention guide](ticket-applications-points.md).

No hosted migration, deployment, commit or push was performed. Apply the documented migrations and public HTTPS QR origin to the existing deployment, publish matching clients, then perform the outstanding hosted and physical-device checks. The local emulator APK must not be mistaken for a hosted-API build.

## Security decisions

- QR payloads use `/verify#token=…`: URL fragments are not sent to the hosting server or in HTTP Referer headers. The web app removes the fragment immediately and submits tokens only in POST bodies. No third-party analytics or QR service receives tokens.
- QR tokens grant no account entitlement. Anonymous lookup returns only validity; authenticated lookup requires the immutable ticket–motorist association. Scanning never claims a ticket.
- A QR may be scanned repeatedly while valid; this is deliberate read-only reuse. Rotation revokes previous tokens, cancellation invalidates them, and expiry is enforced. Payment keeps its existing authenticated idempotency checks.
- No migration backfill will deduct historical driver points. New ledger events will be explicitly versioned and activated only after the new verified-driver workflow exists.
- Development verification uses local PostgreSQL; never run fixture tests or reset/seed the hosted database.

## Follow-up verification - 31 October 2026

The implementation above was already present in repository commit `f842bb2` when work resumed. Existing work was preserved; no commit, push or hosted deployment was performed during this follow-up.

- Restarted the existing local services with `scripts/start-demo.ps1`. PostgreSQL retained its records, all 13 migrations were current, and the API health endpoint and web application returned HTTP 200.
- Started Pixel_8 for headless emulator verification. Its cold boot took approximately eight minutes. Installed the updated debug APK successfully using `adb install --no-streaming -r`, preserving application data, and confirmed a successful activity launch.
- Actual emulator inspection found insufficient contrast in the login header. Changed `apps/officer-mobile/lib/main.dart` to use the existing navy-background `ProductBrand` styling. No authentication, permissions or navigation logic changed.
- Re-ran `flutter analyze` (no issues), `flutter test` (27 passed), and the emulator-targeted debug APK build (passed; 551.6 seconds), then successfully reinstalled the APK.
- Inspected the final emulator screenshots: the Smart Traffic title is readable in white, the eyebrow and subtitle are muted, and the account-type dropdown offers User, Officer and Supervisor. Local screenshots are retained under ignored `.tools/pixel8-final-login.png` and `.tools/pixel8-final-account-types.png`.

This verifies the native login layout and role selector on an emulator; it does not establish physical-camera capture or two-device QR acceptance. The earlier hosted ADMIN HTTP 401, missing local `PUBLIC_SITE_URL`, hosted deployment/private-S3 checks and real-browser/physical-device acceptance remain outstanding. The installed APK uses the local emulator API URL, not the hosted API.
