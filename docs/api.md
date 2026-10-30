# API contract — initial slice

Base: `/api/v1`. Interactive route and request DTO documentation: `/api/docs` (JSON: `/api/docs-json`). DTO fields reject unknown properties. Explicit safe success and error response schemas are included in Swagger.

The 30 October additions (ticket QR, private vehicle applications, catalogue fees and verified-driver points) are documented in [ticket applications and points](ticket-applications-points.md#api-additions). Existing routes remain compatible; `responsibleDriverId` is optional on draft creation and cannot be reassigned by the draft-update endpoint.

Use `Authorization: Bearer <token>` from login. Sessions expire after 30 minutes; login again. Logout revokes the session. Expired/inactive sessions return 401. Disallowed roles return 403; inaccessible object IDs return 404.

| Route                              | Role                              | Behaviour                                                                            |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| POST /auth/login                   | Anonymous                         | `{email,password}` -> `{token,expiresAt,user}`; 5 attempts/IP/minute, 429 thereafter |
| GET /auth/me                       | Staff                             | Safe `{id,name,email,role}`                                                          |
| POST /auth/logout                  | Staff                             | 204; revoke token                                                                    |
| GET /vehicles?registration=ABC1234 | Officer                           | `{items: Vehicle[]}`; exact normalised lookup; empty list if absent                  |
| GET /vehicles/:id                  | Officer                           | Fictional vehicle and minimal driver name/status                                     |
| GET /offence-categories            | Staff                             | Active fictional categories; amounts as decimal strings                              |
| POST /offences                     | Officer                           | Create own DRAFT; same request key/content returns the original draft                |
| GET /offences                      | Officer/supervisor                | `{items,total,page,pageSize}`; own or assigned non-draft records                     |
| GET /offences/:id                  | Officer/supervisor                | Permitted record with vehicle, category, ticket                                      |
| POST /offences/:id/submit          | Officer owner                     | Atomic draft submission; returns existing ticket on retry                            |
| POST /offences/:id/review          | Assigned supervisor               | `{status,notes}` with enforced transitions                                           |
| GET /tickets/:id                   | Officer owner/assigned supervisor | Ticket plus demo disclaimer                                                          |
| GET /audit-events                  | Admin                             | Paginated safe audit metadata                                                        |

Paginated routes accept `page` (1–100000) and `pageSize` (1–100, default 20). Offences also accept a status enum. Invalid IDs/payloads return 400; conflicting keys and transitions return 409.

Draft body: UUID `requestKey`, `vehicleId`, `categoryId`; `location` (3–200 chars), `notes` (3–2000 chars), timezone-bearing ISO `observedAt`, optional paired numeric `latitude` (-90–90) and `longitude` (-180–180). Retain this exact payload/key if a response is lost. Recover known drafts through GET /offences after restarting the app.

Ticket shape: `id`, `offenceId`, random `publicReference`, decimal-string `demoFineAmountSnapshot`, `status`, `issuedAt`. No real payment is accepted. Review notes require 3–1000 characters. Transitions: SUBMITTED -> UNDER_REVIEW -> CONFIRMED or CANCELLED.

Refresh tokens are omitted for the server-session strategy. Draft editing and discard endpoints are documented below. Operational, administration, evidence and public endpoints are listed below. No endpoint exposes password hashes, token hashes or public vehicle search. Authentication implementation follows the response-field exclusion guidance in the [NestJS authentication documentation](https://docs.nestjs.com/security/authentication).

## Added role workflows

| Routes                                                  | Permission and behaviour                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| GET/POST /admin/users; PATCH /admin/users/:id           | Admin accounts; search/pagination on GET; password/role/email/activation changes revoke sessions; self-demotion/disable prohibited |
| GET /admin/supervisors                                  | Admin assignment options; officers require an active supervisor                                                                    |
| GET/POST /admin/categories; PATCH /admin/categories/:id | Admin full category DTO, including active flag and fictional amount                                                                |
| GET/PATCH /admin/settings                               | Admin public notice configuration                                                                                                  |
| GET /admin/security                                     | Admin safe event history (latest 50), account/session/failed-login counts and fixed role permissions                               |
| GET/POST /incidents                                     | Officer creates own report with UUID requestKey; staff GET scoped to reporter/assigned supervisor, pagination and q search         |
| PATCH /incidents/:id                                    | Assigned supervisor: OPEN -> IN_PROGRESS or CANCELLED; IN_PROGRESS -> RESOLVED or CANCELLED, mandatory notes                       |
| GET/POST /checkpoints; PATCH /checkpoints/:id           | Staff list; supervisor creates; creator activates/closes. PLANNED -> ACTIVE/CLOSED; ACTIVE -> CLOSED                               |
| GET /analytics/overview                                 | Supervisor's assigned incidents/offences/officers/ticket counts and seven UTC creation-day totals; shared active checkpoints       |
| GET/POST /offences/:id/evidence                         | Permitted staff list; owner uploads multipart file while DRAFT, JPEG/PNG 5 MB maximum                                              |
| GET /evidence/:id                                       | Owner/assigned supervisor only; authenticated attachment, no-store, no public filesystem route                                     |
| POST /tickets/:id/access-code                           | Issuing officer rotates separate 16-hex-character code; only hash stored, existing public sessions revoked                         |
| GET/POST /alerts; PATCH /alerts/:id                     | Supervisor lists/publishes; creator withdraws/republishes with active boolean                                                      |
| GET /public/notices                                     | Public notice and latest 50 active demo alerts, no staff identities                                                                |
| POST /public/incidents                                  | USER account required; unverified report, owner-scoped requestKey idempotency, five attempts/IP/minute; no record details returned |
| POST /public/tickets/verify                             | USER account plus reference and verificationCode; five attempts/IP/minute; limited ticket plus separate 10-minute public token     |
| GET /public/tickets/current                             | Public bearer token resolves exactly its verified ticket                                                                           |
| POST /public/tickets/payment-simulation                 | Public token; immutable single demo receipt on retries, cancelled tickets rejected; 10 attempts/IP/minute                          |
| POST /public/tickets/logout                             | Revoke public token, 204                                                                                                           |

Public ticket responses contain only warning, reference, demoAmount, status, issuedAt, category, paymentStatus, simulatedAt and receiptReference. They exclude names, identifiers, plates, internal IDs, notes and evidence. Public tokens never authenticate staff endpoints. Simulation does not change legal status or move real funds. If a ticket is later cancelled, its historic simulated receipt remains visible alongside CANCELLED.

## Draft completion and search

`GET /offences` accepts `q` (up to 80 characters) to search permitted plate, location or ticket reference records. Role/ownership scoping still applies before matching.

`PATCH /offences/:id` is officer-owner-only and accepts the current integer `revision` plus changed categoryId, location, notes, observedAt or paired coordinates. Only DRAFT records are editable; stale revisions return 409. Successful edits increment revision and create an audit event. Required values cannot be cleared with null.

`POST /offences/:id/discard` is officer-owner-only, transitions DRAFT to CANCELLED and retains history/evidence. Repeating discard returns the same result without another audit event. No ticket is created, and discarded drafts cannot be submitted. Submitted tickets are reviewed/cancelled by the assigned supervisor instead.

## Motorist account authentication

`POST /auth/login` accepts optional `category`: USER, OFFICER, SUPERVISOR or ADMIN. A category that differs from the stored account role returns the same generic 401 as invalid credentials. The main UI offers the first three categories; `/admin` retains administration.

`POST /public/tickets/verify` and `POST /public/incidents` now require a USER account bearer token. Anonymous callers receive 401; staff roles receive 403. Restricted ticket tokens remain separate and are bound to the account session, so account logout, expiry or revocation also ends ticket access. Public incident retries are scoped to the reporting user. Notices remain anonymous read-only information.

## Motorist account and payment endpoints

See [the account/payment API table and ownership rules](interface-and-payments.md). All new routes retain `/api/v1`, session authentication and server-side ownership. Payment initiation accepts `{ requestKey, reference, method, last4? }`; method is ECOCASH, INNBUCKS or CARD (CARD requires the supplied test `last4=4242`). Outcome accepts `{ outcome }`: APPROVE, DECLINE, TIMEOUT, ERROR or CANCEL. No amount, motorist ID, phone, PAN or CVV is accepted. OpenAPI includes the DTOs and response schemas. Processing expires after 15 minutes; terminal outcomes are idempotent. There are no provider callbacks.

### Ticket display and currency additions

Ticket responses include `displayReference` (INF-year-number). Motorist lists/details also include nullable `receiptPaymentReference` for the owned successful payment. Payment history and receipts add `ticketDisplayReference`; existing request references remain unchanged. Ticket verification accepts the readable or opaque reference and still requires its code and authenticated session. Staff search matches either reference. Motorist amounts report `currency: USD`; payments report their stored currency. Vehicle lookup adds the linked motorist name only. Observation notes may be an empty string; whitespace-only notes remain invalid.

## Motorist vehicle management

The authenticated vehicle inventory now includes vehicle-specific summaries. New account-scoped detail/status, registration-check, pending link/unlink request and nickname endpoints extend the existing Vehicle relationship. Review requires an explicit verification acknowledgement and review note. The command-centre brief now authorises SUPERVISOR review through dedicated supervisor routes; administrative routes remain ADMIN-only. Full route/DTO and ownership details: [vehicle-management.md](vehicle-management.md).

## Supervisor command centre

See [supervisor-reference-layout.md](supervisor-reference-layout.md) for additive summary, scoped payment and audited vehicle-request endpoints. Existing offence responses include minimal issuing-officer and linked-ticket-motorist names. No database migration is needed.
