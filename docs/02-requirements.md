# Implementation checklist

- [x] Phase 0: inspect existing folder and capture decisions; original AGENTS.md preserved.
- [x] Phase 1 source: API/web/mobile application sources, Compose, environment template, schema, migration and seed.
- [ ] Phase 1 verification: dependency resolution, format/lint/type checks, builds and all three apps starting locally; consult the testing report for individual results.
- [x] Minimal Phase 2 source: session authentication, exact lookup, categories, owned drafts, idempotent tickets, assigned review and audit records.
- [ ] Phase 2 verification: PostgreSQL migration/seed and integration tests against a fresh database; complete explicit OpenAPI response schemas and draft editing.
- [ ] Phase 3: run and validate officer workflow on Android; add stronger UI/network tests and refine draft recovery.
- [ ] Phase 4: complete dashboard statistics, search and review UX; validate real mobile-to-dashboard updates.
- [ ] Phase 5: incidents, checkpoints, OSM map attribution and derived demo analytics.
- [ ] Phase 6: secure evidence, public verification, payment simulation, audit UI and hardening.

Do not mark source implementation as acceptance evidence. An absent runtime is a verification gap, not a test pass. Do not begin Phase 6 while the core workflow is unverified or broken.
