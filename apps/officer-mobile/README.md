# Smart Traffic officer app

Fictional university prototype. Not an official ZRP system. Tickets and payments are demonstrations only.

Run the backend from the repository root using `scripts/start-demo.ps1`, then launch `scripts/start-officer.ps1`. The Android emulator connects to the host API at `http://10.0.2.2:3000/api/v1`.

Use the seeded officer account and the locally configured `DEMO_PASSWORD`; search for `ABC1234`. Save a draft, optionally attach evidence, check the preview and issue a demo ticket. Drafts support revision-checked edits and audited discard. Supervisors review submitted records on the web dashboard.

Run `flutter test` and `flutter analyze` here. Build the APK with:

```powershell
flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1
```

Location permission is requested only after selecting one-time location capture. Manual entry remains available. Pending submissions are kept in memory and reuse the same key on retry; inspect recent activity after restart before creating a replacement. See the root README and `docs/offline-design.md` for limitations and the Windows emulator setup.
