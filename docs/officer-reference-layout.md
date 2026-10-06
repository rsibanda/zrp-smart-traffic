# Traffic Officer reference layout — 6 October 2026

The supplied `Traffic officer.png` guides this increment. The web and Android officer screens have been refactored around the existing workflows. No API contract, authentication, RBAC, schema, payment rule or deployment configuration changes were required.

## Files and components

| Files | Changes |
| --- | --- |
| `apps/dashboard/src/OfficerWorkspace.tsx` | New officer dashboard and staff wrapper, navigation, overview calculations, recent activity and operational queues. |
| `apps/dashboard/src/App.tsx` | Mounts the officer workspace around the existing activity/detail tools; uses the shared navy account header styling. |
| `apps/dashboard/src/CitationTerminal.tsx` | Two-column issuance panel with a right-hand ticket/fine/points summary and Issue & Send action. Retains draft, evidence, verification-code and confirmation handlers. |
| `apps/dashboard/src/OperationsPanel.tsx` | Optional initial view, hidden internal navigation and paused polling support. Officer incident/checkpoint panels remain mounted to retain form values and pending retry keys. Supervisor navigation remains unchanged. |
| `apps/dashboard/src/MotoristIcon.tsx`, `style.css` | Reuses the icon system, adds a checkpoint icon and officer-specific responsive styling. |
| `apps/dashboard/src/OfficerWorkspace.test.tsx`, `CitationTerminal.test.tsx` | Overview/date/pagination, direct-route/history, field-retention and confirmed issuance tests. |
| `apps/officer-mobile/lib/officer_shell.dart` | Native officer header, overview, bottom navigation, activity cards, profile and checkpoint display. |
| `apps/officer-mobile/lib/main.dart` | Existing citation, draft editing/discarding, evidence, GPS and incident controls embedded in the officer shell; their API handlers are preserved. |
| `apps/officer-mobile/test/officer_layout_test.dart`, `workflow_test.dart` | Responsive officer navigation/rendering and existing draft-retry/confirmation/reporting workflow coverage. |

## Navigation, layout and responsiveness

Desktop web uses Dashboard, Issue Infringement, Incidents, Checkpoints and My Activity tabs. Mobile web and Android use Home, Issue, Incidents, Checkpoints and Profile in the bottom bar. Profile links to My Activity. There is no second officer navigation grid.

The dashboard contains a welcome block and four summary cards. Desktop uses a row of four; mobile uses a 2-by-2 grid followed by Issue New Infringement. Desktop also shows the issuance panel and a two-column checkpoint/incident queue. Mobile puts the form on the Issue destination and keeps the home screen focused on recent infringements.

Activity cards show configured offence names, readable ticket references, registration, available account linkage, timestamp/location, amount, workflow status and payment status where supplied. Submitted, Under Review and Confirmed use red, amber and green accents with text labels. View opens the retained record tools. Web My Activity provides Search and filter all activity for the existing paginated filters, draft management and details.

The web layout switches at 700 pixels and includes safe-area bottom padding. Android widget tests cover 375, 390 and 430 pixels. A rendered 390-pixel Android screenshot using synthetic test records was visually inspected. That screenshot is a widget-test rendering, not a live emulator screenshot. Browser desktop/tablet/mobile screenshot comparison remains unverified because previous automatic approval review blocked browser/preview startup with “blocked by policy”; no alternate launch workaround was used.

## Data assumptions and preserved behavior

- The officer name is the authenticated identity. Mockup names and statistics are not inserted into application records.
- Issued Today counts stored ticket issuance timestamps in the Africa/Harare calendar day. Pending Reviews counts SUBMITTED and UNDER_REVIEW offences. Active Incidents counts OPEN and IN_PROGRESS reports. Open Checkpoints counts ACTIVE checkpoints whose recorded schedule contains the current time.
- Overview totals read every permitted result page through the existing APIs, rather than treating the first activity page as the total. Ten-second polling refreshes the view; these are client-computed totals over paginated records, not a new server aggregate endpoint.
- Officer offence/incident access retains the server's existing account scope. Checkpoint visibility retains its existing server permission. The officer never calls supervisor analytics or gains checkpoint-management permission.
- The current offence-list contract does not include a motorist name. Cards use a supplied name if present, otherwise Linked account or Not linked. They do not infer the motorist's identity from a driver's name. Vehicle lookup retains the actual linked motorist display where the lookup response supplies it.
- Checkpoint officer/vehicle counts and incident severity are not stored. The interface says these are not recorded; the mockup's example counts and High/Medium labels are not fabricated.
- Fine and points come from the selected offence catalogue. Ticket Reference says Assigned when issued until the backend returns the immutable reference. The UI does not fabricate a pre-issued ticket or a Ready state.
- Web Issue & Send saves/retries the existing draft and opens confirmation. Final Issue Infringement performs the existing idempotent submit. Cancel returns to the saved draft so evidence can be attached before reviewing again. Android retains its draft preview and confirmation dialog.
- “Send” means the existing backend issue/account-link workflow. No SMS, email or external dispatch service is implied or added.
- Citation and incident state survive navigation; optional evidence, explicit GPS permission, draft editing/discarding, payment visibility and verification-code issuance remain available.

## Routes to inspect

Sign in with an officer account and inspect:

- `/officer/dashboard` (the existing `/` entry also opens Dashboard)
- `/officer/issue`
- `/officer/incidents`
- `/officer/checkpoints`
- `/officer/activity`
- `/officer/profile` (mobile Profile; My Activity is available here)

The web restores the destination from the URL on initial rendering and browser history changes. Existing SPA fallback configuration is unchanged.

## Validation

Validation results are recorded below after the final checks. The first PostgreSQL integration attempt failed because the local database was stopped; its existing data directory was started normally, including recovery after an interrupted shutdown. No database reset or seed replacement was performed.

Final results:

- `npm.cmd run lint`: passed; API and dashboard `typecheck`: passed.
- API unit tests: 48 passed. Web tests: 19 passed. PostgreSQL integration tests: 34 passed after the database recovered.
- `flutter analyze`: no issues. Flutter tests: 18 passed, including all three officer mobile widths and the retained officer submission/reporting workflow.
- API compilation and Vite production build: passed.
- Android debug APK: built successfully at `apps/officer-mobile/build/app/outputs/flutter-apk/app-debug.apk`, using the existing emulator API address `http://10.0.2.2:3000/api/v1`.
- `git diff --check`: passed. Existing unrelated working-tree changes were preserved.

Total: 119 passing tests. No browser pixel-match claim or emulator installation is made; native visual review used the rendered widget-test screenshot.
