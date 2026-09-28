# Testing and evaluation

Initial inspection: `node`, `npm`, `docker`, `flutter` and `git` were not recognised on PATH. No implementation existed. Portable Node was subsequently downloaded into ignored `.tools` and verified against the official SHA-256 checksum; it does not modify the machine PATH permanently.

Portable Node, PostgreSQL and Flutter are now installed. Android Studio's SDK is linked at `%LOCALAPPDATA%/Android/Sdk`; Flutter uses Android Studio's JBR. The five migrations preserve existing operational records; the motorist-account migration invalidates legacy anonymous ticket sessions. The Android debug APK build passed on September 28 using the emulator API address `http://10.0.2.2:3000/api/v1`.

## Automated coverage supplied

- API unit tests enumerate every review state transition and assert ownership scopes.
- API integration tests use real seeded PostgreSQL for login rejection, anonymous access, validation, exact/no-result lookup, draft-key retries, simultaneous ticket submission, single issuance audit, other-officer access denial, assigned/unassigned review, transitions and logout revocation.
- Web tests check the visible demo boundary, rejected login, public ticket verification, payment simulation and session closure.
- Flutter tests check sign-in and the officer workflow: fictional lookup, unchanged-payload retry after connection loss, draft editing, ticket issuance and accident reporting.

## Verified results

- API unit tests: 37 passed.
- PostgreSQL integration tests: 18 passed, including revision conflicts, draft discard, authorization, incidents/checkpoints, private image rejection and deduplication, public/staff session separation, verification throttling and idempotent payment simulation. The image test initially exceeded the five-second unit-test default on this cold disk; integration timeouts are now 30 seconds. Assertions are unchanged.
- Fresh schema: `node scripts/check-fresh-database.mjs` passed all migrations and fictional seed data; only its disposable schema was removed.
- Dashboard tests: three passed on September 28, including the three-category login, hidden services before sign-in and motorist logout. A cold worker startup timed out; the serial thread-worker rerun passed. Vitest now uses one thread worker on this development machine.
- Flutter tests: two passed; `flutter analyze` reported no issues.
- API/dashboard type checks, lint and production builds passed.
- Real Chrome walkthroughs: officer API submission -> supervisor review -> persisted officer result; admin create/disable; supervisor analytics/map attribution; public verification/payment/logout passed. Scripts retain labelled demo records.
- Automated axe WCAG checks: no violations in the tested public/login, admin and supervisor screens, including public layout at 390px. An undersized checkbox target was fixed. This is not a complete manual accessibility audit.
- Local API sample: ten `/public/notices` requests, median 5 ms and maximum 17 ms. No horizontal overflow on the tested 390px page. This is a local baseline, not a load-test or production capacity claim.

## Remaining acceptance boundary

Pixel_8 exists, but `emulator -accel-check` returns code 6: no usable hypervisor. BIOS virtualization is enabled; this agent's Windows session is not elevated. Run the provided administrator-only hypervisor script and restart Windows. No Android boot, camera/location permission acceptance or real mobile-to-dashboard run is claimed until then. Visual Studio is unnecessary for this Android/web project.

Encrypted persistent offline work remains optional and deferred as described in `offline-design.md`. A second-machine reproduction and deployment-level security/privacy/operations review remain separate work.

## Operational wording revision

The September 28 UI revision passed 37 API unit tests, 18 PostgreSQL integration tests, three dashboard tests, lint, typecheck, builds and a fresh-schema seed check. Flutter analysis and both widget tests passed. Browser checks covered all four roles, maps, ticket verification/payment/logout and officer-to-supervisor review. Updated automated WCAG checks found no violations across login, admin, supervisor and motorist views; the 390px login had no horizontal overflow. See [UI terminology review](ui-terminology-review.md) for changed files, retained identifiers and status constraints.
