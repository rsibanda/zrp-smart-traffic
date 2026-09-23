# Prototype threat model and remaining limits

Assets: fictional staff credentials, sessions, operational records, image evidence and audit history. Trust boundaries: anonymous/public browser, staff browser/mobile app, NestJS API, PostgreSQL, private filesystem and external OSM tile service.

| Threat | Implemented control | Residual limitation |
| --- | --- | --- |
| Guessing credentials/tickets | Argon2id staff passwords; login/public verification rate limits; random ticket reference and separate random code | Single-process memory throttling; no multi-node deployment or account recovery |
| Changing IDs or roles | Server roles, ownership/assignment predicates, DTO validation and explicit public response fields | Fixed role permissions; no configurable permission editor |
| Lost responses/retries | UUID request keys, unique ticket relation, serializable transactions, content-deduplicated evidence and single simulated receipt | Outbox is in memory; inspect activity after app termination |
| Malicious uploads | JPEG/PNG allowlist, size/pixel/file-count limits, actual decode and re-encode, random private filenames, authenticated downloads | No antivirus service; original metadata removed; no incident evidence attachments |
| Stolen session | Digest-only storage, expiry, logout, revocation on account/code changes, in-memory clients | Local HTTP debug only; TLS required for any separate deployment |
| Public information leakage | Separate public sessions, per-ticket authorization, no plate/driver/evidence response fields | Users must avoid putting personal data into public alert text |
| Abusive or inaccurate public reports | Rate limiting, unverified label, supervisor review, minimal data collection | No identity verification, emergency dispatch or automated spam triage |
| Unauthorised changes | Transactional audit records and admin audit/security view | Local DB administrator can alter data; no tamper-evident archive or automated retention |

Map tiles load only after explicit map display; OSM attribution is visible. No offline tile scraping/prefetching or production traffic entitlement is assumed. Alerts poll while the page is open; no real-time SMS/push delivery or official feeds exist.

Before any real deployment, separately evaluate privacy, legal rules, accessibility, security, TLS, backups, data retention, operations and official interfaces. This document records prototype boundaries, not an approval for deployment.
