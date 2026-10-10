# Command centre reference implementation

The 9 October 2026 supervisor brief and `inspector.png` guide this refinement of the existing React and Flutter clients. The implementation retains the navy/teal theme, session authentication, assigned operational records, existing review transitions, payment simulation and vehicle ownership model.

## Screens and components

- Web: `SupervisorWorkspace.tsx` wraps existing offence review controls and `OperationsPanel`. Desktop navigation is Dashboard, Offence Review, Incidents, Checkpoints, Payments, Reports. The mobile web bar is Home, Reviews, Incidents, Checkpoints, More.
- Android: `supervisor_shell.dart` provides the corresponding dashboard, bottom navigation and More menu around the existing `RoleWorkspace` review actions.
- Both clients show six backend-derived metrics, pending offence previews, incident/checkpoint records, vehicle requests, payment history and recent issued infringements. Readable ticket references, stored motorist/officer names, configured currency, fine/point snapshots and status badges replace internal identifiers in presentation.
- Web records use compact tables on desktop and stacked cards below 700 pixels. Android uses cards with labelled status accents. The header identifies the authenticated supervisor; no sample dashboard totals are embedded in application code.
- Existing search, pagination, evidence access, offence/incident review, checkpoint actions, web maps, reports and notice publishing remain accessible.

## Vehicle approval

The latest brief explicitly expands vehicle-request review authority to SUPERVISOR. Supervisors receive a dedicated route family; `/admin/vehicle-link-requests` remains ADMIN-only. Both web staff roles share `VehicleApprovals.tsx`; Android uses `vehicle_approvals.dart`.

Requests are listed pending-first. Opening details records `VEHICLE_REQUEST_VIEWED` and shows the requesting account name/email, stored vehicle details, registration status, an ownership-conflict flag and recent request/decision history. Other owners' identities are not disclosed. Missing vehicle year is not fabricated.

Review requires a note, an ownership-check acknowledgement and a separate confirmation naming the motorist and plate. Approval uses the existing serializable transaction and records the authenticated reviewer. No client-supplied reviewer ID is accepted. A conflicting vehicle owner prevents approval. Rejection grants no vehicle access. Duplicate identical decisions remain idempotent; opposite decisions conflict. Unlink requests retain their outstanding-ticket checks. Historical ticket ownership never transfers.

The existing internal approval status `VERIFIED` is displayed as Approved in the review interface; no enum migration or contract-breaking rename was introduced. Vehicle inventory and Registered Vehicles continue to derive from `Vehicle.motoristId`, so accepted links appear through normal refresh.

## API and data

All paths below are under `/api/v1` and require a valid staff session.

| Method | Route | Access / purpose |
| --- | --- | --- |
| GET | `/supervisor/summary` | SUPERVISOR: pending vehicle requests and today's successful assigned-ticket payment total |
| GET | `/supervisor/payments` | SUPERVISOR: paginated payments for non-draft offences assigned to that supervisor |
| GET | `/supervisor/vehicle-link-requests` | SUPERVISOR: paginated vehicle review queue |
| GET | `/supervisor/vehicle-link-requests/:id` | SUPERVISOR: safe details, ownership conflict, history; audited view |
| POST | `/supervisor/vehicle-link-requests/:id/review` | SUPERVISOR: existing `{status, note, checked: true}` decision contract |
| GET | `/admin/vehicle-link-requests/:id` | ADMIN: same audited detail workflow |

Existing offence responses add the officer name and the ticket's linked motorist name. Staff request queues add stored vehicle display fields. OpenAPI response schemas describe the additions. No schema migration, seed reset, authentication or deployment change is required.

Payment reads select only display fields, omit card digits/credentials and follow the existing offence assignment boundary. Payments Today uses the Harare UTC+02:00 calendar day and successful simulations. Vehicle-request review is a system-wide staff queue expressly authorised by this brief; it does not broaden offence, incident or payment scope.

## Limits of existing workflows

- Offence review remains SUBMITTED → UNDER_REVIEW → CONFIRMED/CANCELLED. No unsupported Return for Correction action was invented.
- Incidents retain their assigned-supervisor scope and supported status changes. Severity and officer/team assignment are not modeled, so the UI says Not recorded; there is no new assignment workflow.
- Checkpoint staffing and vehicles-checked counts are not stored and show Not recorded. Existing schedules/statuses remain authoritative; no counters are fabricated.
- Officers Active means enabled officer accounts assigned to the supervisor, not live online presence. Officer Activity lists recent issued infringement records rather than exposing the administrator audit log.
- Vehicle verification is a staff attestation using internal records, not an external government-registry check. Receipts and payments remain simulations.

## Changed files

- API: `supervisor.controller.ts`, `vehicle-accounts.ts`, `offences.service.ts`, `app.module.ts`, `response-contracts.ts`, `test/vehicles/integration.spec.ts`.
- Web: `SupervisorWorkspace.tsx`, `VehicleApprovals.tsx`, `OfficerWorkspace.tsx`, `App.tsx`, `VehicleManager.tsx`, `style.css`, `SupervisorWorkspace.test.tsx`, `VehicleManager.test.tsx`.
- Android: `supervisor_shell.dart`, `vehicle_approvals.dart`, `role_workspace.dart`, `presentation.dart`, `vehicle_workspace.dart`, `supervisor_layout_test.dart`, `account_roles_test.dart`.
- Documentation: this report, `vehicle-management.md`, `api.md`, `decisions.md`, root and mobile READMEs. Existing unrelated workspace changes were preserved.

## Routes to inspect

Sign in as Supervisor, then inspect `/supervisor/dashboard`, `/supervisor/reviews`, `/supervisor/incidents`, `/supervisor/checkpoints`, `/supervisor/payments`, `/supervisor/reports` and `/supervisor/vehicles`. On Android use Home, Reviews, Incidents, Checkpoints and More → Vehicle Approvals / Payments / Reports / Profile. Motorist submission remains under My Vehicles; administrator review remains under `/admin`.

## Validation

Results will be recorded after the full verification run. Coverage includes existing login/review/incident/checkpoint flows, supervisor vehicle approval/rejection, conflicting ownership, session-derived audit identity, payment assignment isolation, and web/native navigation and confirmation. Native layout tests render at 375, 390 and 430 pixels; optional local screenshots are saved under ignored `.tools`.

Desktop browser pixel inspection is not claimed. Automated browser launch was unavailable under the environment's earlier approval-review restriction. Native rendered screenshots are inspected directly; React interaction tests validate the web controls.
