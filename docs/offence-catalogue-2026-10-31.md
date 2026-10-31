# Offence catalogue update - 31 October 2026

The user-specified USD amounts and points below are configurable demonstration values, not official tariffs or legal guidance. Administrators can change them through the existing offence catalogue controls.

| Category                        | Fine (USD) | Points |
| ------------------------------- | ---------: | -----: |
| Speeding                        |         50 |      3 |
| Drunk driving (DUI)             |        200 |      6 |
| Running a red light             |         80 |      4 |
| Mobile phone use while driving  |         40 |      3 |
| Reckless driving                |        150 |      6 |
| Driving without a valid licence |        100 |      5 |
| Failure to wear a seatbelt      |         30 |      2 |
| Illegal parking                 |         25 |      0 |
| Driving an unregistered vehicle |         75 |      3 |
| Failure to obey traffic signs   |         40 |      2 |

## Inspection and changes

- The local database contained seven active categories: the generic US$25 / 0-point entry and six older examples. Speeding was US$150 / 3 points, parking US$40 / 1 point, and licence US$100 / 3 points. The existing category API returned the stored fine and points, and both web and Android selection controls already derived their summaries from that API.
- Data migration `20261031090000_offence_catalogue` updates matching entries in place and inserts missing categories. It matches by code or normalised name, including the older licence label. Ambiguous existing duplicates stop the migration for explicit reconciliation. IDs, offence relationships, unrelated categories, existing activation preferences and payment due days are preserved.
- The generic fallback and older distinct categories remain available; existing records are not relabelled as a specific offence without supporting data. Ticket fine/point snapshots and driver ledger entries are untouched.
- The seed no longer reintroduces old speeding, parking or licence defaults; it retains the other distinct existing examples. The migration supplies the ten requested defaults, and subsequent seeds preserve administrator changes. Run migrations before seed, as in the existing setup instructions. No schema or API contract changed.
- Web citation summaries update immediately from the selected catalogue entry, then use the server-returned draft values and issued-ticket snapshots. The selection resets for a new infringement, missing selections show a message and block submission, and amount/point changes are announced accessibly. No duplicated tariff table was added to either UI.
- Existing server logic remains authoritative: active category required; penalties snapshotted at issuance; points applied only to the verified responsible driver; retry returns the existing ticket without another debit. Category edits apply to future issuance, not existing tickets. Generic historical records retain their original penalties.

## Deployment and verification

Apply `npm run db:migrate` to the intended environment and publish the matching web build. Do not reseed accounts or reset the database for this change. Existing Android builds fetch the catalogue at sign-in/refresh and need no tariff-specific rebuild. Reopen the citation screen to load the updated catalogue. Hosted deployment is a separate step; local catalogue changes do not change hosted data.

Verified locally:

- `npm run lint` and `npm run typecheck`: passed. After preserving the three distinct older seed examples, the tools TypeScript check also passed.
- `npm test`: 52 API unit tests and 28 web tests passed. The citation test switches DUI, parking and speeding without refreshing, checks US$200 / 6, US$25 / 0 and US$50 / 3, guards missing selection, and confirms issuance.
- `npm run test:integration`: 53 tests / 9 suites passed. New coverage tests all ten penalty pairs, catalogue reads, issuance snapshots, officer/supervisor/motorist reads after catalogue changes, remaining-point totals, owner isolation, duplicate issuance, and inactive/unknown-category rejection.
- The migration passed in an isolated temporary schema, including repeat execution, name matching with a custom code and preservation of category IDs and the generic fallback.
- `npm run db:migrate`: applied locally successfully (14 migrations total). Before/after checksums confirmed existing tickets, offences and driver-point ledger entries were unchanged; all prior category IDs and codes remained intact.
- Authenticated read against the running local Officer API returned each of the ten requested names exactly once with its configured amount and points. The verification session was logged out.
- `npm run build`: API and Vite production builds passed. `git diff --check` passed.

No accounts were reseeded, no historical deductions were recalculated, and no hosted deployment or database change was performed. Native source and layout are unchanged; its existing catalogue-based calculations use the same updated API. Native device interaction was not retested in this increment.

## Hosted deployment follow-up

At the user's subsequent deployment request, commit `b80e38e` was deployed to Render and verified against the already-published matching Netlify build. All 14 hosted migrations are applied after an isolated Neon-copy check. The running Officer and Supervisor APIs return all ten exact category/penalty pairs. Existing records and private evidence were preserved. See [deployment results and login verification limits](../DEPLOYMENT.md#deployment---31-october-2026).
