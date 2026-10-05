# Motorist interface reference pass — 5 October 2026

The supplied `UPGRADE.jpg` is the layout reference for this increment. The existing React and Flutter screens have been adapted in place. Authentication, RBAC, API contracts, database schema, ownership rules and simulated payment processing are unchanged.

## Files and components

| Files | Change |
| --- | --- |
| `apps/dashboard/src/App.tsx` | Motorist-specific header and main-container styling; identity still comes from the session. |
| `apps/dashboard/src/MotoristDashboard.tsx` | Five-destination navigation, URL restoration, welcome/summary layout, infringement cards and recent payments; existing payment and receipt handlers retained. |
| `apps/dashboard/src/MotoristIcon.tsx` | Small reusable inline SVG icon component; no new dependency. |
| `apps/dashboard/src/style.css` | Scoped motorist layout, responsive navigation, card typography, status accents and actions. |
| `apps/dashboard/src/App.test.tsx`, `MotoristDashboard.test.tsx` | Updated welcome assertion and payment-preview mocks; added direct-route/history/navigation and secondary-service coverage. |
| `apps/officer-mobile/lib/role_workspace.dart` | Motorist header and five-item bottom navigation; reports/notices moved under Profile. Supervisor screen retained. |
| `apps/officer-mobile/lib/motorist_ledger.dart` | Controlled destination, four summary tiles, infringement layout, payment cards and stale-response protection during navigation. |
| `apps/officer-mobile/test/account_roles_test.dart`, `ledger_navigation_test.dart`, `motorist_layout_test.dart` | Updated navigation paths and added responsive interaction/rendering checks. |

## Navigation and layout

Desktop uses five compact tabs beneath the navy header. At 700 pixels and below, that same web navigation becomes a fixed white bottom bar with Home, Fines, Payments, Vehicles and Profile labels, icons and active-state styling. Android uses those five native destinations. Safe-area padding keeps the web content clear of the bottom bar.

The Dashboard contains a welcome block and four summary cards. Desktop lays out four cards in a row; mobile uses a 2-by-2 grid. Cards use the existing navy/teal palette, with blue payment actions, amber pending, red overdue and green paid indicators. Infringement titles open the existing details. Pay Now and View Receipt use the existing flows.

Desktop Dashboard adds three recent payment records and a View all action. Mobile follows the supplied order and accesses payment history through Payments. Profile provides Traffic Notices & Reports and My Reports as secondary services, preserving ticket verification and incident reporting. My Vehicles retains its working registration, details, status and ownership-request interfaces.

## Data assumptions

- Names, counts, currency, offence titles, references, statuses and payment methods come from the existing account endpoints. No reference-image sample values are inserted into application data.
- Dashboard infringement cards use the three most recent returned account records, including settled records as shown in the reference. The requested desktop section title is Outstanding Infringements; the mobile title is Recent Infringements. Individual status labels remain authoritative, and View all opens the full paginated list.
- Points retain their stored positive penalty values; the UI does not imply that payment removes points or invent a negative points balance.
- Paid Fines is omitted from the summary presentation, as the brief makes it optional. Its backend calculation remains available.
- Existing vehicle and ticket identifiers remain API-internal. Visible ticket labels use the human-readable display reference; the image's shortened sample references are not substituted.

## Routes to inspect

Sign in as a motorist, then inspect:

- `/motorist/dashboard` (the existing `/` entry also opens Dashboard)
- `/motorist/infringements`
- `/motorist/payments`
- `/motorist/vehicles` and `/motorist/vehicles/ABC1234` for an account linked to that sample vehicle
- `/motorist/profile`
- `/motorist/notices` and `/motorist/reports` through Profile

Primary navigation updates the URL; initial rendering and browser history restore the appropriate page. Existing server/hosting SPA fallback configuration is unchanged.

## Validation

- Lint and API/web typecheck passed.
- 48 API unit tests, 16 web tests and 34 PostgreSQL integration tests passed.
- Flutter analysis passed with no issues; 15 Flutter tests passed, including motorist layout/actions at 375, 390 and 430 pixels and the existing vehicle-management tests at those widths.
- API compilation and Vite production build passed.
- Android debug APK build passed with the existing emulator API URL (`http://10.0.2.2:3000/api/v1`).
- A rendered Android widget screenshot was inspected at 390 pixels using synthetic test records; this is not an emulator or live-data screenshot. Optional local capture is enabled by `CAPTURE_MOTORIST_UI=true` in the layout test on this prepared Windows workspace.
- Browser screenshot comparison at desktop/tablet/mobile sizes remains unverified. Earlier automatic approval review blocked browser/preview startup with “blocked by policy”; no alternate launch method was used. Responsive web behavior is implemented in CSS and navigation/actions are covered by component tests, not a browser rendering test.
