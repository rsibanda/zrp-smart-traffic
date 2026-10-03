# Interface and account-data refinement

The web dashboard and Android app retain the navy/teal theme, existing routes, session authentication and role boundaries. The reference images informed the citation sequence, financial hierarchy and status cards; external branding was not copied.

## Changes

- Central currency helpers format amounts as `US$25.00`. The simulated catalogue uses USD (`apps/api/src/currency.ts`); payment records retain their currency. The migration changes old synthetic `UNITS` records to USD without changing numeric amounts. This is not a conversion of real funds or an official tariff.
- Each ticket receives a database-generated unique `INF-year-number` display reference, including existing tickets. The original opaque public reference, UUID, verification code and ownership remain unchanged. Clients use opaque keys for existing API requests and the readable reference for display. Verification accepts either reference and still requires the separate code and authenticated account. Staff search accepts the readable reference.
- Payment methods display as EcoCash, InnBucks or Bank Card. Missing historical methods display Payment; their original enum remains intact. Successful attempts display Paid.
- Infringement cards have distinct pending, overdue and paid accents, prominent amounts, reference labels, registration, location, date, points, and Pay Now or direct View Receipt actions. Payment history and receipts use the same display conventions.
- Citation lookup expands in place. It shows the linked account name, requires explicit category selection, previews configured fine/points, permits empty observation notes, and retains evidence attachment and confirmation. No arbitrary severity multiplier was introduced: the existing configured category determines the fine and points. Historical generic categories are not reclassified without evidence.

## Vehicle and demerit consistency

The local database was inspected: ABC1234 is explicitly assigned to the seeded Tawanda Ncube account, and the registered-vehicle query returns **1**. The screenshot showing 0 does not match that local state. Vehicle counts and lists use the same `Vehicle.motoristId` relationship. Existing seed logic repairs only the identified, unassigned synthetic sample vehicle; administrators can verify and assign other vehicles through the existing account-link form. Ticket verification does not prove vehicle ownership and must not automatically create that link. No hosted database was changed.

Demerits sum immutable ticket snapshots for the signed-in motorist, excluding cancelled tickets. Payment does not remove points. Integration tests issue records with three points, check the dashboard aggregation, and verify that successful payment leaves points intact while reducing the amount payable. Existing sample records with zero recorded points remain zero.

## Verification

- Lint and TypeScript checks pass.
- API unit tests: 48; web tests: 12; PostgreSQL integration tests: 31 — all pass.
- Flutter analysis and nine tests pass, including all three simulated payment methods.
- NestJS/Vite production build and Android debug APK build pass.
- All eight migrations and the seed pass in a fresh, isolated local schema. The existing local database migration also passes without resetting records.
- Integration coverage includes issue retries, account isolation, readable-reference verification with both factors, nonzero points, vehicle count/list agreement, all three payment methods, receipts, history method labels and supervisor payment state.

Browser screenshot inspection was not completed; prior automatic approval review blocked headless Chrome. Pixel_8 login and the motorist dashboard were inspected: US$150 payable, four points, one paid fine and one registered vehicle. Paid and pending cards display readable references and the appropriate receipt/payment actions. A scrolling regression test also verifies that payment-tab state survives scrolling and periodic notice refresh; summary cards grow to prevent narrow-screen overflow. No authentication, RBAC or deployment configuration was changed.

## Main files

API: Prisma schema and `20261002220000_ticket_display_currency` migration; currency helper; payments service; motorist, public and traffic controllers; offence search; DTOs and response contracts; validation and integration tests.

Web: presentation helpers, MotoristDashboard, CitationTerminal, App, PublicPortal, AdminPanel, shared CSS and regression tests.

Android: presentation helpers, motorist ledger, role workspace, officer screen and tests. README, API documentation and decisions describe the compatibility and data assumptions.

Final Android package rebuilt after the scrolling/overflow fixes, installed successfully on Pixel_8, and launched. The final automated total is 100 passing tests (48 API, 12 web, 31 integration, 9 Flutter). Dashboard and API are running locally; no hosted deployment was performed.

## Hosted release — 3 October 2026

The web/API refinement is now deployed as commit `aa0a4df`. This supersedes the earlier local-only deployment status. Migration testing used an isolated Neon copy before production and preserved existing tickets and lookup identifiers. The 91 web/API tests, typecheck, lint and production builds passed again; Flutter was not rebuilt as part of this hosted release. All four hosted role login checks passed, as did USD/readable-reference and account-total consistency checks.

Unlike the local fixture, hosted ABC1234 has no motoristId. A zero registered-vehicle count therefore matches the hosted relationship. No ownership was inferred from an infringement. Use the existing administrator link action after verifying the account assignment. See DEPLOYMENT.md for release IDs and operational details.
