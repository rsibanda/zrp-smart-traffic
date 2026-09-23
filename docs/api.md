# API contract — initial slice

Base: `/api/v1`. Interactive route and request DTO documentation: `/api/docs` (JSON: `/api/docs-json`). DTO fields reject unknown properties. Explicit response schemas are still pending; the shapes below describe the implementation.

Use `Authorization: Bearer <token>` from login. Sessions expire after 30 minutes; login again. Logout revokes the session. Expired/inactive sessions return 401. Disallowed roles return 403; inaccessible object IDs return 404.

| Route                              | Role                              | Behaviour                                                                            |
| ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| POST /auth/login                   | Anonymous                         | `{email,password}` -> `{token,expiresAt,user}`; 5 attempts/IP/minute, 429 thereafter |
| GET /auth/me                       | Staff                             | Safe `{id,name,email,role}`                                                          |
| POST /auth/logout                  | Staff                             | 204; revoke token                                                                    |
| GET /vehicles?registration=DEMO001 | Officer                           | `{items: Vehicle[]}`; exact normalised lookup; empty list if absent                  |
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

Refresh tokens and draft edits remain deferred. Operational, administration, evidence and public endpoints are listed below. No endpoint exposes password hashes, token hashes or public vehicle search. Authentication implementation follows the response-field exclusion guidance in the [NestJS authentication documentation](https://docs.nestjs.com/security/authentication).

## Added role workflows

| Routes | Permission and behaviour |
| --- | --- |
| GET/POST /admin/users; PATCH /admin/users/:id | Admin accounts; search/pagination on GET; password/role/email/activation changes revoke sessions; self-demotion/disable prohibited |
| GET /admin/supervisors | Admin assignment options; officers require an active supervisor |
| GET/POST /admin/categories; PATCH /admin/categories/:id | Admin full category DTO, including active flag and fictional amount |
| GET/PATCH /admin/settings | Admin public notice configuration |
| GET /admin/security | Admin safe event history (latest 50), account/session/failed-login counts and fixed role permissions |
| GET/POST /incidents | Officer creates own report with UUID requestKey; staff GET scoped to reporter/assigned supervisor, pagination and q search |
| PATCH /incidents/:id | Assigned supervisor: OPEN -> IN_PROGRESS or CANCELLED; IN_PROGRESS -> RESOLVED or CANCELLED, mandatory notes |
| GET/POST /checkpoints; PATCH /checkpoints/:id | Staff list; supervisor creates; creator activates/closes. PLANNED -> ACTIVE/CLOSED; ACTIVE -> CLOSED |
| GET /analytics/overview | Supervisor's assigned incidents/offences/officers/ticket counts and seven UTC creation-day totals; shared active checkpoints |
| GET/POST /offences/:id/evidence | Permitted staff list; owner uploads multipart file while DRAFT, JPEG/PNG 5 MB maximum |
| GET /evidence/:id | Owner/assigned supervisor only; authenticated attachment, no-store, no public filesystem route |
| POST /tickets/:id/access-code | Issuing officer rotates separate 16-hex-character code; only hash stored, existing public sessions revoked |
| GET/POST /alerts; PATCH /alerts/:id | Supervisor lists/publishes; creator withdraws/republishes with active boolean |
| GET /public/notices | Public notice and latest 50 active demo alerts, no staff identities |
| POST /public/incidents | Anonymous unverified report, requestKey idempotency, five attempts/IP/minute; no record details returned |
| POST /public/tickets/verify | Reference and verificationCode; five attempts/IP/minute; limited ticket plus separate 10-minute public token |
| GET /public/tickets/current | Public bearer token resolves exactly its verified ticket |
| POST /public/tickets/payment-simulation | Public token; immutable single demo receipt on retries, cancelled tickets rejected; 10 attempts/IP/minute |
| POST /public/tickets/logout | Revoke public token, 204 |

Public ticket responses contain only warning, reference, demoAmount, status, issuedAt, category, paymentStatus, simulatedAt and receiptReference. They exclude names, identifiers, plates, internal IDs, notes and evidence. Public tokens never authenticate staff endpoints. Simulation does not change legal status or move real funds. If a ticket is later cancelled, its historic simulated receipt remains visible alongside CANCELLED.
