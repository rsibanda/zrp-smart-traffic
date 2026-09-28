# Implementation checklist

- [x] Phase 0: inspect existing folder and capture decisions; original AGENTS.md preserved.
- [x] Phase 1 source: API/web/mobile application sources, Compose, environment template, schema, migration and seed.
- [x] API/web foundation verified, including fresh-database migrations and seed; portable local PostgreSQL supported.
- [ ] Android emulator acceptance: Android Studio SDK and Pixel_8 linked; Windows Hypervisor Platform requires administrator activation and a restart.
- [x] Minimal Phase 2 source: session authentication, exact lookup, categories, owned drafts, idempotent tickets, assigned review and audit records.
- [x] Phase 2 PostgreSQL workflow tests: authentication, idempotency, assigned reviews and ownership boundaries.
- [x] Phase 3 source and widget workflow: login, lookup, draft/retry, ticket, accident reporting, camera/gallery evidence and motorist verification code. Device acceptance remains separate.
- [x] Phase 4 dashboard: scoped lists, statistics, polling, review, account/role/assignment/category management and security audit. API-to-browser workflow verified.
- [x] Phase 5: incidents, checkpoints, attributed OSM map and derived seven-day demo analytics.
- [x] Phase 6 functional slices: private re-encoded image evidence, separate public verification/session, payment simulation, public alerts/reports and threat model.
- [x] Finishing implementation and automated checks: draft edits/discard, search, explicit OpenAPI responses, one-time GPS with permission-denial coverage, accessibility/performance checks and Android debug APK build. Real device permission checks remain below.
- [ ] Android camera/location permissions and mobile-to-dashboard acceptance after emulator acceleration is enabled.

Offline encrypted persistence is optional and deferred by the documented [offline design](offline-design.md). Fixed server roles define permissions; no arbitrary permission editor or real payment/SMS/government integration is intended.

Do not mark source implementation as acceptance evidence. An absent runtime is a verification gap, not a test pass. Do not begin Phase 6 while the core workflow is unverified or broken.

- [x] Revised login: exactly User (motorist), Officer and Supervisor categories; motorist services only after account sign-in. Existing administration retained at `/admin`.
- [x] USER role restrictions, category mismatch rejection, verified-ticket parent-session expiry/logout, and fresh migration/seed tested.
