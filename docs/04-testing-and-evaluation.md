# Testing and evaluation

Initial inspection: `node`, `npm`, `docker`, `flutter` and `git` were not recognised on PATH. No implementation existed. Portable Node was subsequently downloaded into ignored `.tools` and verified against the official SHA-256 checksum; it does not modify the machine PATH permanently.

Final check results will be recorded here after execution. PostgreSQL/Docker and Flutter/Android are not installed in this environment; database integration and Android runtime verification remain pending.

## Automated coverage supplied

- API unit tests enumerate every review state transition and assert ownership scopes.
- API integration tests use real seeded PostgreSQL for login rejection, anonymous access, validation, exact/no-result lookup, draft-key retries, simultaneous ticket submission, single issuance audit, other-officer access denial, assigned/unassigned review, transitions and logout revocation.
- Web test checks the visible demo boundary and rejected-login behaviour.
- Flutter widget test checks the demo-labelled sign-in surface.

These tests do not yet cover all acceptance criteria. Evidence rejection, maps/coordinates, incidents, accessibility/performance and real mobile-to-web propagation remain unimplemented or unverified. Run a fresh database migration and repeat the README demo on a second machine before claiming reproducibility.
