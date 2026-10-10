# Smart Traffic officer app

Fictional university prototype. Not an official ZRP system. Tickets and payments are demonstrations only.

Run the backend from the repository root using `scripts/start-demo.ps1`, then launch `scripts/start-officer.ps1`. The Android emulator connects to the host API at `http://10.0.2.2:3000/api/v1`.

Use the seeded officer account and the locally configured `DEMO_PASSWORD`; search for `ABC1234`. Save a draft, optionally attach evidence, check the preview and issue a demo ticket. Drafts support revision-checked edits and audited discard. Supervisors review submitted records on the web dashboard.

Run `flutter test` and `flutter analyze` here. Build the APK with:

```powershell
flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Location permission is requested only after selecting one-time location capture. Manual entry remains available. Pending submissions are kept in memory and reuse the same key on retry; inspect recent activity after restart before creating a replacement. See the root README and `docs/offline-design.md` for limitations and the Windows emulator setup.

## Mobile account types

The sign-in screen now includes **Account type: User, Officer, Supervisor**. Select the category assigned to your account. The existing backend validates the category; the selector does not grant permissions. Sign out to return to the selector and change accounts.

- User: motorist notices, ticket reference/code verification, payment simulation, incident reporting and safe retries.
- Officer: existing vehicle lookup, offence/draft/ticket, evidence and incident workflows.
- Supervisor: overview and assigned officer activity, paginated assigned offences/incidents, supported reviews, checkpoint listing and creator-only activation/closure. The web dashboard retains the additional map, checkpoint creation and alert publishing tools.

Use `user@demo.invalid`, `officer@demo.invalid` or `supervisor@demo.invalid` with the existing local `DEMO_PASSWORD`. No administrator role is offered in this mobile login. Motorist account sessions and restricted ticket tokens remain separate; signing out revokes the parent account session and its ticket access.

## Motorist ledger and receipts

User sign-in now loads account totals, infringements/details, vehicles, own reports and payment history above the existing notices and ticket-verification section. Pay Now supports EcoCash, InnBucks and Bank Card simulations with approval/decline/timeout/error/cancel outcomes. Resume pending attempts from Payments; successful payments expose receipts with Android document download and print/save PDF. No raw payment input is transmitted or stored.

Officer preview displays configured points and amount and requires a final confirmation. Supervisor offences support payment-status filters. These screens require the additive motorist/payment migration and updated backend. See `docs/interface-and-payments.md` from the repository root.

## Supervisor command centre

Supervisor sign-in provides Home, Reviews, Incidents, Checkpoints and More. More includes Payments, Vehicle Approvals, Reports and Profile. Vehicle requests require detail inspection, a review note, verification acknowledgement and final confirmation. The updated backend supplies scoped payment history and audited approval endpoints. Existing review transitions and creator-only checkpoint updates remain unchanged. See `docs/supervisor-reference-layout.md` at the repository root.
