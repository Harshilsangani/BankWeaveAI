# BankWeave AI — UI review

Reviewed: **8 October 2026**

All nine application tabs were inspected from screenshots, then checked through browser interactions. The existing single AI Analyst, inline analytical answers and standalone Data Workspace are retained.

## Screenshot coverage

- **39 before screenshots:** desktop and mobile dark mode, every desktop light-mode tab, customer/source/quality views and populated analyst, investigation, scenario and report workflows.
- **51 updated screenshots:** the same coverage plus customer declarations, analyst Tools, uploaded-form Markdown, success notices, policy reader, command palette, mobile navigation and the tablet Command Center.
- Capture sizes: desktop **1440 × 1050**, mobile **390 × 844**, tablet **900 × 1200**. Regression checks additionally cover **320 × 740**.
- Updated capture manifest: **zero page-width overflows, zero outlying controls and zero recorded browser JavaScript/console errors**. Tables and relationship graphs intentionally scroll within their own containers.

Open [before gallery](artifacts/ui-audit/before/index.html), [updated gallery](artifacts/ui-audit/after/index.html) or [layout measurements](artifacts/ui-audit/after/layout.json). Dialog screenshots use the viewport so fixed overlays are represented correctly.

## Completed improvements

| Area               | Change and user benefit                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command Center     | Removed excess shortcut spacing; aligned tablet KPI values and risk exposures. Recently opened investigations refresh the dashboard.                                                                                                                                                                                                  |
| AI Analyst         | Grouped attachment and Tools controls, kept sending controls on the right, bounded expandable coverage, and moved success notices above the conversation so they cannot cover the composer.                                                                                                                                           |
| Risk Radar         | Compact, expandable rule/run details; severity colors follow the record's severity. The sidebar count tracks active signals after dismissal.                                                                                                                                                                                          |
| Investigations     | Corrected relationship-map heading/highlight styles, removed duplicate sibling keys that produced a React warning, improved case-field spacing and preserved keyboard access to scrollable evidence.                                                                                                                                  |
| Scenario Simulator | Clearer empty state and disabled report creation while the report is being prepared.                                                                                                                                                                                                                                                  |
| Reports            | Clearer empty-state icon; repeated retrieval of the same report does not duplicate its preview in the list.                                                                                                                                                                                                                           |
| Knowledge          | Header actions wrap cleanly on mobile; policy-card buttons align across cards.                                                                                                                                                                                                                                                        |
| Settings           | Styled and labelled local role selection; improved mobile settings spacing.                                                                                                                                                                                                                                                           |
| Data Workspace     | Larger customer review panels with a persistent title/close button; transaction headings now precede their table. Added grouped product/review sections, a single Clear filters action, a sticky customer column on mobile and responsive summary/tab/filter layouts.                                                                 |
| Shared UI          | Centered scrollable dialogs, larger mobile targets, consistent empty states, focus styles and scroll hints that appear only when needed. Mobile navigation traps focus, restores it on close, prevents background scrolling and keeps hidden links out of keyboard navigation. Toasts are suppressed while the mobile drawer is open. |

## Validation

- Production build and TypeScript check passed.
- All **9 TypeScript data/service tests** passed.
- All **14 focused production browser tests** passed across the workspace, data directory, observed relationship graph and UI layout checks.
- All **4 UI regression checks passed again against the final standalone production build**, including the drawer-toast adjustment. The completion is recorded in the roadmap.
- An analyst response exceeded the initial development-run timeout under concurrent audit load; its isolated rerun and the production mobile flow passed. No test timeout was increased to hide that failure.

These checks used Microsoft Edge on Windows. They do not constitute a full cross-browser or real-device accessibility audit. The data was not reset or reseeded; cloud integration remains a separate roadmap task.

## Reproduce the review

With the local application/backend running:

```powershell
node scripts/capture-ui-audit.mjs after
npx playwright test tests/browser/ui-layout.spec.ts tests/browser/workspace.spec.ts tests/browser/data-workspace.spec.ts tests/browser/relationships.spec.ts
```

Set `RISKLENS_BROWSER_BASE_URL` to inspect another local build. `--final-check` updates the affected responsive/notice captures in an existing gallery; `--drawer-check` updates the policy, command palette and drawer captures.

## Google-inspired theme — implemented

Completed **8 October 2026** after approval of the isolated theme concept. The actual app now uses bright white and pale blue surfaces in light mode, charcoal surfaces in dark mode, blue actions, pill-shaped navigation/buttons and softer cards. The original BankWeave identity and banking workflows remain.

- **Shared visual system:** [app/theme.css](app/theme.css) owns all palette, elevation and corner-radius tokens and is imported by the root layout. The old green palette was removed. Chart gradients, avatars and the favicon follow the new direction.
- **Complete surface coverage:** all nine tabs, analyst greeting/composer and rich inline answers, risk/evidence panels, tables, dialogs, customer creation/edit/delete review, declarations, KYC, policy upload, insurance/payment maintenance, cashflow, observed relationship maps, command palette and mobile navigation.
- **Keyboard and readability:** blue focus rings on forms and actions, a single focus ring around the analyst composer, and secondary text at **4.76:1** against pale light-mode surfaces. The greeting has a forced-colors fallback. These checks are not a full accessibility audit.
- **Exports:** newly generated HTML reports use the white/blue palette, rounded metric panels, responsive wrapping and print styling. Existing stored report files remain unchanged under their immutable export contract.
- **Preferences and data:** dark/light selection continues to persist. The working database was not reset or reseeded; the browser suite exercised its existing synthetic workflows, including creation of one additional form-review test profile.

The [implementation gallery](artifacts/ui-audit/google-theme/index.html) contains **120 final screenshots** with theme/screen-size filters. It covers desktop and mobile in both themes, a tablet dashboard, and downloaded report layouts. Its [manifest](artifacts/ui-audit/google-theme/layout.json) records **zero page-width overflow, zero outlying controls and zero browser JavaScript/console errors**. Wide tables and maps scroll within their containers.

Validation: production build and TypeScript passed, **9 data/service tests passed**, **all 30 production browser tests passed**, and the canonical immutable-report backend test passed against an isolated temporary database. All **4 UI regression checks passed again** against the final production build after the contrast/focus refinements. Captures used Microsoft Edge on Windows.

To reproduce the complete theme review against a running application:

```powershell
node scripts/capture-ui-audit.mjs google-theme
node scripts/capture-ui-audit.mjs google-theme --forms-check
```

The forms pass opens editors and confirmation dialogs without submitting customer changes. It creates a synthetic investigation/report to inspect the relationship map and downloaded export. The earlier [concept comparison](artifacts/ui-audit/google-theme-preview/index.html) is retained as an archive.

## Saved chat navigation — implemented 9 October 2026

Recent chats sits between the main navigation and Resources and includes New chat, search, dated groups and active highlighting. Only the history list scrolls; Resources and the profile remain visible at 1366×768 and in the 390×844 mobile drawer. The composer stays usable after reopening a chat, and mobile selection closes the drawer.

Rich charts, filters and canonical corrected/saved form reviews restore after selection and reload. Each tab retains its own selection. Initial restore failures offer a retry, and dashboard failures do not prevent using saved conversations.

The [chat-history gallery](artifacts/ui-audit/chat-history/index.html) and [manifest](artifacts/ui-audit/chat-history/layout.json) contain 10 final captures across desktop, laptop, mobile and both themes, including search and restored answers. They record zero page-width overflow and zero console/page errors; profile bounds remain within the viewport. The earlier 120-image Google-theme gallery is preserved as the pre-history review.

Validation: production build/typecheck and 9 data/service tests passed; 41 backend tests plus 7 focused middleware/history checks passed. 35 unique browser checks were verified across the full run and corrected greeting-fixture rerun. All 9 history/UI checks passed again against the final production build.

## Guided CSV/Excel import — reviewed 9 October 2026

The data workspace now offers record type, a drag/drop/file picker, template downloads, worksheet selection, suggested/manual column mapping, safe timezone selection, row validation, explicit confirmation and owned review history. The detailed source checks sit below the wizard. Customers imported from spreadsheets show their provenance and are included in upload filters/counts.

The [import gallery](artifacts/ui-audit/imports/index.html) covers desktop/mobile upload and mapping states in both approved themes; its [manifest](artifacts/ui-audit/imports/layout.json) records overflow and console/page errors. All 4 import/quality browser checks passed, including the confirmed linked four-sheet import, customer overview, mapping/error download and mobile layout. Working customer data was preserved; tests used an isolated snapshot.

Final captures: 8 screenshots across desktop/mobile and both themes, with zero page-width overflow and zero console/page errors. Light-mode upload and dark-mode mobile mapping were visually inspected. The original four-sheet Excel template was also rendered and inspected, and read back through the actual parser.


## BankWeave AI rename — 9 October 2026

Desktop dark/light analyst, desktop command center, mobile light navigation and mobile analyst screenshots are in `artifacts/ui-audit/bankweave/`. The longer BankWeave wordmark fits the settled mobile drawer and desktop sidebar. All workspace views passed the branding/navigation smoke checks with zero overflow or browser errors. `checks.json` records the title, template filename and compatibility-session check. Mobile captures wait for drawer transitions to finish.
