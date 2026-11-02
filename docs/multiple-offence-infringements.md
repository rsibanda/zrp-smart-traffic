# Multiple offences on one infringement

The STS web citation form supports distinct checkbox selections, removable chips, individual fine/points values and combined totals. The API remains authoritative. An infringement retains one draft, reference, ticket, evidence set, review, payment balance and driver-points assessment.

`POST /offences` and draft `PATCH /offences/:id` accept `categoryIds` (1–100 distinct UUIDs). Existing clients may continue sending a single `categoryId`. Sending both forms, duplicates, unknown categories or inactive categories is rejected. Retry comparison treats the selection as a set. The database also enforces uniqueness per infringement/category.

`OffenceCharge` stores the categories and their name/fine/points snapshots at issuance. Ticket totals sum the configured values using decimal arithmetic. The existing verified-driver requirement, one debit on issuance and cancellation credit are unchanged. The combined ticket uses the earliest configured category due period. No catalogue fines, points or allowances are changed.

The existing primary `categoryId` relation is retained for compatibility; multi-offence clients display `charges` (staff reads) or `offences` (motorist/public reads and issuance). Names and penalties use issued snapshots; draft lines use the current catalogue. Old mobile clients can still create single-offence infringements; the new multi-select control is in the web app.

## Migration and verification

Apply `20261102100000_multiple_offence_charges` before starting the updated API, then regenerate the Prisma client. The migration backfills one line per existing infringement and preserves existing ticket fine/point snapshots, including cancelled tickets. Existing draft lines remain unfrozen. No reseed or data reset is needed, and seed values are unchanged.

Relevant checks: `npm run db:generate`, `npm run db:migrate` against a local development database, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`, `npm run lint`, `npm run format:check`. The points integration suite includes multiple selection, concurrent issuance retries, immutable breakdowns, officer/supervisor/motorist reads, account isolation and cancellation credit.

Current cloud validation uses engine-free generated Prisma types for static checks and unit tests because network policy denies `binaries.prisma.sh`. Full API/database integration is not validated here; normal client generation and integration tests must run once that host is allowed. The migration backfill, issued-value preservation, uniqueness and cascade behavior were checked directly in PostgreSQL in a rolled-back temporary schema. No hosted database or deployment was changed.

Verified for this change: 68 API unit tests and 30 frontend tests passed; workspace type checks, API and frontend builds, lint, changed-file formatting and `git diff --check` passed. The repository-wide format check reports 30 pre-existing issues in untouched files, which were left unchanged. The added database integration case was type-checked but could not execute because normal Prisma engine generation is blocked by the network policy.
