# Motorist vehicle management

My Vehicles now supports account registration requests, verified vehicle cards, internal status checks, vehicle details, central infringement/payment totals, nicknames and reviewed unlink requests on the web and Android. Vehicle metrics replace the unrelated global summary on this page. The Dashboard keeps its existing summary.

## Ownership workflow

1. A signed-in motorist enters a registration and checks it.
2. Vehicles already assigned to that account show their verified link. All other registrations receive the same verification-required response; the endpoint cannot be used to discover someone else's vehicle details or whether a plate exists.
3. Submit Link Request creates a pending request. Repeated submissions return the existing pending request.
4. An administrator reviews the request, checks supporting ownership information outside this prototype, supplies a review note and confirms that verification was performed. Approval requires an existing internal vehicle record and refuses a vehicle assigned to another account. Rejection grants no access.
5. Approved vehicles appear through the existing ten-second refresh, and the Dashboard's registered vehicle count comes from the same ownership relationship.

Administrator review preserves the existing ADMIN-only vehicle assignment permission. The suggested supervisor approval path is deliberately not enabled; supervisors and motorists cannot approve requests. This is an internal academic workflow, not official registration or a national registry lookup.

Unlinking requires a pending request and administrator approval. Both steps check for outstanding, non-cancelled tickets assigned to that motorist. Approval rechecks ownership and unpaid tickets inside a serializable transaction. Unlinking never deletes tickets or transfers their historical ownership. Vehicle nicknames are cleared when account assignment changes.

## Data and API

Migration `20261005090000_vehicle_requests` adds nullable `Vehicle.nickname` and `Vehicle.linkVerifiedAt`, plus `VehicleLinkRequest` history with requester, normalized registration, LINK/UNLINK kind, PENDING/VERIFIED/REJECTED status, timestamps and reviewer metadata. A partial unique index prevents duplicate pending requests. `Vehicle.motoristId` remains the sole ownership relationship. Existing seed records remain compatible; no verification dates or missing year/VIN/expiry fields are invented.

All routes use `/api/v1`. Existing session, role and audit mechanisms remain in place.

| Method | Route | Access / purpose |
| --- | --- | --- |
| GET | `/motorist/vehicles` | USER: paginated verified vehicles and vehicle-specific totals |
| GET | `/motorist/vehicles/requests` | USER: own paginated request history |
| POST | `/motorist/vehicles/check` | USER: validated `{registration}`; privacy-preserving result |
| POST | `/motorist/vehicles/link-request` | USER: pending request, `{registration}` |
| GET | `/motorist/vehicles/:vehicleId` | USER: own overview, totals, paginated central tickets and safe history |
| GET | `/motorist/vehicles/:vehicleId/status` | USER: current internal status and check timestamp |
| PATCH | `/motorist/vehicles/:vehicleId` | USER: `{nickname}` only, up to 60 characters |
| POST | `/motorist/vehicles/:vehicleId/unlink-request` | USER: request removal, subject to outstanding-ticket checks |
| GET | `/admin/vehicle-link-requests` | ADMIN: paginated review queue |
| POST | `/admin/vehicle-link-requests/:id/review` | ADMIN: `{status, note, checked: true}`, status VERIFIED or REJECTED |

`:vehicleId` is the normalized registration resource key, not a database UUID. The web detail URL uses `/motorist/vehicles/:vehicleId`. Account IDs come exclusively from the authenticated session. Unknown input fields are rejected. Check/request endpoints are rate limited. Only tickets already assigned to that account contribute to vehicle infringements and totals; another owner's historical tickets remain private.

## Changed implementation

- API: Prisma schema/migration, `vehicle-accounts.ts`, controller/service registration, safe response contracts, existing motorist route and administrator assignment metadata.
- Web: `VehicleManager.tsx`, `MotoristDashboard.tsx`, `AdminPanel.tsx`, and vehicle/card/status styles.
- Android: `vehicle_workspace.dart`, `motorist_ledger.dart`, and status presentation.
- Tests: API vehicle integration suite, web vehicle component suite, Android vehicle workspace tests at 375, 390 and 430 pixels.

## Validation scope

Automated coverage includes session-derived ownership, cross-account denial, unauthorized review denial, unknown/other-owned plate privacy, duplicate pending requests, approval conflicts, counts, account-scoped tickets, exact fine totals, nickname restrictions, unlink checks before and after a new fine, immutable historical ticket ownership, empty states, status display and registration flow. Android widget tests exercise registration, approval refresh, status checks, details and nickname editing at all three requested widths.

Browser screenshot inspection is not claimed: automated Chrome launch was blocked by the environment's approval review. Web behavior is covered by component tests; Android responsiveness by widget tests. No external vehicle registry or document-verification service is implemented.

### Results — 5 October 2026

- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck`: passed for API, tooling and web.
- `npm.cmd test`: 48 API unit tests and 15 web tests passed.
- `npm.cmd run test:integration`: 34 PostgreSQL integration tests passed.
- `npm.cmd run build`: API compilation and web production build passed.
- `flutter analyze`: no issues; `flutter test`: all 12 tests passed.
- All nine migrations and the seed passed in a fresh isolated local schema, which was removed afterward. The existing local database received the additive migration without resetting data.
- Live API smoke checks passed: health 200, motorist login, own vehicle inventory/detail; unauthenticated inventory access returned 401. No emulator was connected during validation.

The local web-preview startup command was also rejected by automatic approval review with “blocked by policy”; no more specific reason was supplied. No browser screenshot inspection is claimed.

Android packaging also passed: `flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1` produced `apps/officer-mobile/build/app/outputs/flutter-apk/app-debug.apk`. Installation was not attempted because no emulator/device was connected.
