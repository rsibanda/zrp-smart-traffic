# Ticket verification, vehicle applications and driver points

Implemented increment: 30 October 2026. These are academic workflows with synthetic records and simulated payments. Fees and points are configuration examples, not official tariffs or legal rules. Existing branding, authentication, navigation, historical tickets and vehicle ownership are retained.

## Setup and demonstration

1. Generate the Prisma client and apply migrations with `npm run db:generate` and `npm run db:migrate`. Never reset or reseed an existing hosted database. The four new migrations add QR tokens, vehicle applications/categories/fees and a driver-points ledger. Category examples are inserted only if the category catalogue is empty. Existing offence categories remain unchanged.
2. For real QR links, configure backend `PUBLIC_SITE_URL` as the deployed HTTPS frontend origin, with no path, query or credentials. `TICKET_QR_EXPIRY_DAYS` defaults to 30 (1–365). Without a public origin, issuance still works and offers the existing manual reference/code mechanism; QR generation returns a clear unavailable response. A localhost API cannot make newly created local records available on the hosted site: the issuing and scanning clients must use the same backend/database.
3. Keep the existing `EVIDENCE_STORAGE=s3` and private bucket settings on hosting. Local development uses private filesystem storage. `APPLICATION_FILE_LIMIT_MB` defaults to 10 (1–20); `APPLICATION_ATTACHMENT_LIMIT` defaults to 5 (3–5). Restart the API after configuration changes.
4. Administrator: open **Driver identity & points policy**, verify an existing synthetic driver's licence against the correct active motorist email, and record a reason. This creates the initial 12-point account once. The policy editor changes starting allowances for future accounts; it does not reset existing balances.
5. Officer: find a vehicle, explicitly look up and confirm the responsible verified driver, select an offence, review and issue. A category configured for three points produces 12 → 9 once. Leaving driver identification pending does not deduct the vehicle owner's points. Issue confirmation offers QR enlargement/sharing and the existing manual code action.
6. Motorist: use **My Infringements → Scan Ticket QR**, an uploaded QR image, or **Use ticket reference & verification code**. Only the ticket's linked account can open private QR details. Eligible details offer simulated payment; payment never restores driver points.
7. Motorist: **My Vehicles → New vehicle application & status**. Choose category, complete metadata, save draft, attach an ownership PDF/image plus front and rear/plate photographs, then submit. Camera capture and file selection are available on Android; web file controls offer camera capture on supporting devices. HEIC/HEIF must be converted to JPEG/PNG.
8. Supervisor: **Vehicle Approvals → Review vehicle applications**. Open the application and its private attachments, confirm checks, enter a reason, then approve, reject or request changes. Changes requested allows edits and resubmission. Approval creates/links a vehicle once; another account's ownership blocks approval and does not reveal that account's identity.
9. Application fee simulation offers EcoCash, InnBucks and Bank Card after submission. It uses the saved fee and generates an application receipt on success. It does not approve the application. Fine payments keep their existing flow and receipts.

## Data and security decisions

- QR URLs use `/verify#token=...`; the fragment is removed from the browser address after capture. Tokens are cryptographically random, stored hashed, expiring and revocable. Anonymous scans return validity only. Repeated read-only scans are allowed until expiry, replacement, revocation or ticket cancellation. Scanning cannot claim ownership. Token verification is rate-limited; token values are excluded from audit events.
- The application extends the existing `VehicleLinkRequest` relationship with `APPLICATION` rather than introducing another vehicle ownership model. New application review is supervisor-only. Existing link/unlink routes remain but cannot bypass application review. Existing vehicle fields and ticket account snapshots are not rewritten on approval.
- Attachments are content-validated. JPEG/PNG are decoded and re-encoded without unnecessary metadata. PDFs are parsed, limited to 50 pages, stripped of document metadata and rejected for active actions, attachments and forms. This is content inspection, **not a configured antivirus service**. Downloads require an authorised grant; private S3 URLs and local signed URLs expire after two minutes. Do not log signed URLs or upload bodies.
- Application draft saves snapshot the selected catalogue fee. Submission freezes it; changes requested and later catalogue edits do not change the submitted fee. Transactions use integer USD minor units. A unique successful-payment constraint prevents double success. Application payments do not enter the traffic-fine payment history; they remain visible with their application and receipt to the authorised motorist and supervisor.
- Points belong to an explicitly verified `Driver.motoristId`, separate from `Vehicle.motoristId`. The officer must identify responsibility before draft creation. Existing status names remain: offence `SUBMITTED` and ticket `ISSUED` are created by the current submission transaction. **Ticket issuance is the debit boundary**, not draft creation or later supervisor confirmation.
- A unique `(ticketId,event)` ledger constraint and serializable transactions enforce one issuance debit and one cancellation credit. Payment has no ledger mutation. Displayed balances floor at zero; the full debit remains recorded and is fully reversed on cancellation. No reset or discretionary adjustment endpoint is introduced.
- The migration marks old tickets `LEGACY_NOT_ASSESSED`; historical tickets are not backfilled. New unidentified tickets are `PENDING_DRIVER_IDENTIFICATION`. New verified issuance is `ASSESSED`. Driver identification is not retroactively inferred from an owner, name or payment. Resolution/backfill of older unidentified tickets requires a separately approved audited workflow.
- The old accumulated `demeritPoints` dashboard field remains for API compatibility. New clients use `driverPoints.remaining` and `allowance`. Account totals are derived from persisted ledger entries, never hard-coded.

## Attachment retention and deletion policy

This is a local academic data policy, not a statutory retention claim. Only synthetic documents belong in this environment.

- Retain current attachments while an application is active or required for the scheduled assessment. Review retention at the end of the assessment, with a proposed limit of 90 days after a final decision; the project owner must confirm the actual retention period before any operational use.
- A motorist may remove/replace draft or changes-requested attachments. The API records the action, removes the database attachment association, and attempts immediate deletion of the previous private object. Existing signed object-store grants may work for their remaining two-minute lifetime.
- Terminal application attachments are not deleted by the motorist. After an authorised retention review, an administrator/operator should enumerate the exact expired application/file IDs, record approval, delete only their private objects and file metadata, and append a cleanup audit record. Preserve application decisions, financial snapshots, ownership history and driver-points entries.
- There is **no automatic retention job** in this increment. Failed best-effort object deletion may leave a private orphan. Operators must reconcile storage objects against `VehicleApplicationFile.storageKey` before any targeted cleanup; never delete a bucket or reset the database for retention. Physical copies downloaded by a reviewer require separate handling.

## API additions

All paths are under `/api/v1`; OpenAPI documents DTOs and response shapes.

| Role                          | Endpoint                                                                                                     | Purpose                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Officer                       | `POST /tickets/:id/qr`                                                                                       | Issue/rotate own ticket QR                    |
| Officer / assigned supervisor | `POST /tickets/:id/qr/revoke`                                                                                | Revoke QR                                     |
| Anonymous                     | `GET /public/ticket-qr/config`, `POST /public/ticket-qr/status`                                              | Allowed origin and validity only              |
| Motorist                      | `POST /motorist/ticket-qr/verify`                                                                            | Entitled ticket lookup                        |
| Motorist / admin              | `GET /vehicle-categories`                                                                                    | Catalogue; motorists see active categories    |
| Admin                         | `POST /admin/vehicle-categories`, `PATCH /admin/vehicle-categories/:id`                                      | Audited fee configuration                     |
| Motorist                      | `GET/POST /motorist/vehicle-applications`, `GET/PATCH .../:id`, `POST .../:id/submit`                        | Own application lifecycle                     |
| Motorist                      | `GET .../limits`, `POST .../:id/files/:kind`, `POST /motorist/vehicle-application-files/:id/remove`          | Limits/upload/remove                          |
| Supervisor                    | `GET /supervisor/vehicle-applications`, `GET .../:id`, `POST .../:id/review`                                 | Submitted applications and decisions          |
| Motorist / supervisor         | `POST /vehicle-application-files/:id/download`                                                               | Authorised short-lived download grant         |
| Signed grant only             | `GET /vehicle-application-files/:id/content`                                                                 | Local private content                         |
| Motorist                      | `POST /motorist/vehicle-applications/:id/payments`, `POST /motorist/application-payments/:reference/outcome` | Own fee simulation                            |
| Admin                         | `GET/POST /admin/driver-points/policy`, `POST /admin/driver-identities/verify`                               | Allowance and explicit identity verification  |
| Officer                       | `GET /drivers/verified?licenceNumber=...`                                                                    | Exact, rate-limited responsible-driver lookup |
| Motorist                      | `GET /motorist/driver-points`                                                                                | Own balance and ledger history                |

## Acceptance still requiring deployment or hardware

- These source changes are not published. Apply migrations safely to the existing hosted database, configure `PUBLIC_SITE_URL`, deploy API and web from the same revision, then build Android with the hosted `/api/v1` URL. Preserve existing CORS, RBAC, storage and hosting configuration.
- On a second physical phone, scan a newly issued QR and verify logged-out privacy, correct motorist access, wrong-account denial and revoked/expired rejection. Do not substitute a portal-homepage QR for a ticket QR.
- Exercise rear-camera photos, camera permission refusal, uploaded QR images, interrupted uploads and private S3 PDF/image downloads on the deployed system. Widget and HTTP tests do not establish camera/hosted acceptance.
- Review the live web screens at 375/390/430 pixels and desktop with keyboard navigation. Native widget tests cover those widths; there is no completed browser-driven visual acceptance for this increment.

Verification results and remaining acceptance items are tracked in [the work audit](remaining-work-2026-10-30.md).
