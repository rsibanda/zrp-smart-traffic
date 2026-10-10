# Operational UI terminology review

The September 28 presentation update follows the user's explicit request to replace the earlier banner-based prototype wording. Architecture, route paths, authentication, role permissions, ownership checks and ticket verification remain unchanged.

## Files changed

- Web: `apps/dashboard/index.html`; `src/App.tsx`, `PublicPortal.tsx`, `OperationsPanel.tsx`, `AdminPanel.tsx`, `AlertsPanel.tsx`, `EvidencePanel.tsx`, `DemoMap.tsx`, `style.css`; new `presentation.tsx`; updated existing App/PublicPortal tests.
- Mobile: `apps/officer-mobile/lib/main.dart`, new `lib/presentation.dart`, Android manifest label, existing widget/workflow tests and README.
- API: `src/configure.ts`, `traffic.controller.ts`, `public.controller.ts`, `admin.controller.ts`, `evidence.controller.ts`, `dto.ts`, `staff.dto.ts`, `response-contracts.ts`; existing integration fixture plate queries.
- Data: `prisma/seed.ts`, the SystemSetting display default in `schema.prisma`, and migration `20260928110000_operational_display_text/migration.sql`. No relationship or enum changes.
- Verification/documentation: three browser check scripts, root README, API reference, decisions and this report.

## Visible changes

Branding is ZRP Smart Traffic Management System on web and ZRP Smart Traffic on mobile. The existing theme and TRAFFIC OPERATIONS label remain. A small Academic Prototype footer replaces the large banners. Ticket, registration, offence, incident, checkpoint, evidence, notice and account wording is operational. Maps use the stored location and retain OSM attribution. Empty states and error messages no longer use classroom language.

Authenticated identity still comes from the session's `name`; the UI does not hard-code an officer or motorist name. Role labels display MOTORIST, TRAFFIC OFFICER, SUPERVISOR or ADMINISTRATOR. Service numbers are not added to the session contract or fabricated in the UI.

Generated development identities include Officer Tendai Moyo, Officer Rudo Dube, Inspector Chipo Ndlovu and Tawanda Ncube. They do not identify actual people. Seed vehicle ABC1234, category Traffic offence (TRF-001), Central Traffic Checkpoint and Samora Machel Avenue, Harare replace the old initial labels. The migration updates known old values, preserves edited records, retains database IDs and does not rewrite issued ticket references or audit history. Stored category names continue to render directly; no offence is reclassified as speeding or another unsupported allegation.

## Status boundaries

Badges display readable labels while submitted API values remain unchanged. OPEN incidents display Submitted and IN_PROGRESS displays Under review. Payment simulation displays Pending or Paid in its explicitly simulated payment interface. A successful simulation does not mark an offence as legally paid.

The current backend does not have separate incident Assigned/Closed, checkpoint Completed/Cancelled, offence Paid or payment Failed/Refunded transitions. Those states were not invented. Checkpoint CLOSED displays Closed because existing records do not say whether they were completed or cancelled. Adding those distinctions requires a separate workflow change.

## Remaining terminology and why

The final case-insensitive repository search reviewed `fictional`, `demo`, `training`, `classroom`, `student prototype` and `university prototype`. It excluded dependencies, generated output, local tool caches and secrets. Remaining matches are intentional:

| Location                                                               | Remaining terms                                                                                 | Reason                                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma schema, DTOs, controllers and web/mobile types                  | `demoFineAmount`, `demoFineAmountSnapshot`, `demoAmount`, analytics `demo`, settings key `demo` | Stable API/database identifiers; not visible labels.                                                                                                          |
| Alert controller and presentation formatter                            | `DEMO_ALERT_PUBLISHED`, `DEMO_ALERT_UPDATED`                                                    | Audit action identifiers preserved; rendered as readable alert actions.                                                                                       |
| `DemoMap.tsx` and its import                                           | `DemoMap`                                                                                       | Internal component name only; map copy and accessibility label updated.                                                                                       |
| Existing accounts, seed, setup and test scripts                        | `@demo.invalid`, `DEMO_PASSWORD`, `traffic_demo`, `demo_postgres`, `start-demo.ps1`             | Preserve login addresses, configuration and local data. Addresses remain visible in account-management email fields.                                          |
| Already-issued receipt references                                      | `DEMO-…` where previously generated                                                             | Immutable historical identifiers retained; new simulated receipts use `PAY-…`.                                                                                |
| Existing test fixtures/names                                           | Mock names, descriptions, plates and references                                                 | Deliberately synthetic test data; not application copy. Only assertions/selectors and queries affected by changed seed data were updated.                     |
| Migration history and new exact-match migration predicates             | Previous text and seed keys                                                                     | Needed to migrate existing installations safely; prior applied migrations are immutable.                                                                      |
| README, project documentation, `AGENTS.md`, mobile package description | Prototype limitations and earlier decisions                                                     | Developer-facing provenance and limitations remain accurate; not rendered application screens. User's explicit UI request supersedes earlier banner guidance. |
| Android manifest comment                                               | Android documentation URL containing `/training/`                                               | External platform documentation, not app text.                                                                                                                |
| Browser checks                                                         | Search expressions and test-console descriptions                                                | Detect regressions and describe verification; not rendered UI.                                                                                                |

The payment button remains **Simulate payment**, with explanatory text that no money is collected. This preserves honest behavior without a large warning banner. Academic Prototype is the only prototype label in the normal application layout. Existing user-entered descriptions are never silently filtered or rewritten by the UI.

## Verification

API unit tests: 37 passed. Dashboard tests: 3 passed. PostgreSQL integration tests: 18 passed. Lint, typecheck, API/dashboard builds and fresh-schema migration/seed checks passed. Flutter analysis passed with no issues and both Flutter tests passed.

Real Chrome checks passed for administrator account management, supervisor analytics/checkpoints/maps, motorist ticket verification/payment/logout and officer activity/incidents. A separate officer submission → supervisor review → persisted confirmed result walkthrough passed. The visible-text check found no legacy wording in those screens, apart from preserved account email addresses excluded explicitly from that check. A scan of stored display fields found zero legacy terms; receipt references, immutable audit identifiers and email addresses are excluded from display-copy migration.

Automated WCAG checks reported zero violations for login, administrator, supervisor and motorist views, including login at 390px without horizontal overflow. One initial browser run encountered the existing login rate limit; a later rerun passed without weakening throttling. Android device acceptance remains subject to the existing Windows emulator acceleration prerequisite; widget tests do not substitute for device acceptance.

The updated Android debug APK also built successfully (442.4 seconds), including the new branding, footer, labels and status badges.

## UI polish follow-up

Polished the web role interfaces using the existing navy/teal palette: header identity hierarchy, card spacing, typography, action buttons, grouped forms, filters, table spacing/hover/actions, restrained badges, empty states and responsive layouts. Supervisor figures now precede alert publishing. The new `apps/dashboard/src/Field.tsx` displays existing native validation messages below fields with accessible associations; it does not change input constraints or submission logic. Scrollable tables have labelled, keyboard-focusable regions.

Files: dashboard `style.css`, `Field.tsx`, `App.tsx`, `AdminPanel.tsx`, `OperationsPanel.tsx`, `PublicPortal.tsx`, `AlertsPanel.tsx`, `EvidencePanel.tsx`, and `scripts/check-accessibility.mjs`. Backend contracts, data, permissions and business logic are unchanged. The Flutter application is outside this web polish increment.

Verification: lint, typecheck, 37 API unit tests, three dashboard tests, 18 integration tests and API/web builds passed. Real-browser inline validation appeared for an invalid field and cleared after correction. Automated accessibility checks passed for all four roles at 1280px, 768px and 390px, plus login, with no page-level horizontal overflow. The initial audit-table keyboard scrolling issue was fixed before the successful rerun. Screenshots are stored locally under `.tools/polish-*-desktop.png` and `.tools/polish-*-mobile.png`.
