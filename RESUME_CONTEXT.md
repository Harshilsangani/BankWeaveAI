# BankWeave AI — resume checkpoint

Product name approved by the user: **BankWeave AI** (9 October 2026), with descriptor **Banking Intelligence & Operations**. The UI, metadata, analyst labels, service types, provider identity, new report/template/error downloads and documentation have been renamed. Preserve the legacy `RISKLENS_*` environment variables, `x-risklens-*` headers, browser/session storage keys, database filenames and container volume identifiers for compatibility. Do not rename or reset storage to complete a cosmetic brand change. Historical immutable reports and source metadata keep their original provenance.

Saved **9 October 2026**. The sidebar chat history and the subsequently requested guided CSV/Excel importer are **COMPLETED — LOCAL**. Read `IMPORT_GUIDE.md` for upload formats and boundaries.

## Project and constraints

- Workspace: `C:\Users\HARSHIL\Documents\ChatGPT\singapore`.
- Next.js 16.3.8, React 19.2, TypeScript, Tailwind 4, Recharts; FastAPI, LangGraph and SQLite backend.
- Gemini/Vertex/GCP activation remains deferred until deployment. The current provider is local and data is synthetic.
- Preserve the approved Google-inspired white/charcoal and blue theme.
- Preserve the working database, all 10,000 original Meridian customer IDs, linked banking records and added profiles. **Do not reset or reseed the working database.** Do not edit an already-applied checksummed migration.
- Keep the defensive formatters in `features/data-workspace/stats.ts`.
- Project source is tracked on `main`, with `origin` set to `https://github.com/Harshilsangani/BankWeaveAI.git`. Preserve local edits; do not use Git reset/clean. Runtime databases, credentials, dependencies and generated screenshots are excluded from Git. Curated source audits and aggregate integrity evidence are included.
- Follow `AGENTS.md`: read relevant installed guides under `node_modules/next/dist/docs/` before coding. Installation, server/client, CSS and layout guides were read for this work.
- Do not spawn subagents unless explicitly requested by the user or applicable instructions.

## Completed sidebar history

Recent chats appears between main navigation and Resources, with New chat, automatic first-question titles, dated groups, search, active highlighting, loading and retry states. Empty new chats do not clutter the saved list. Switching dataset/month archives populated conversations rather than erasing them.

Reopening restores rich answer blocks, dataset/month and investigation context. Form reviews hydrate canonical corrections and saved status, so reopening a confirmed form does not offer another customer creation. Reports are shared within the workspace. Each browser tab retains its selected chat across reloads even when another tab changes its selection.

Streams and replay are scoped to their originating conversation. Workspace and staff ownership are enforced. Switching/new-chat operations are locked during active work or context saves. Initial restoration failures can retry the whole workspace. Dashboard loading failures no longer block the analyst.

Key implementation files:

- Backend: `backend/migrations/015_conversations.sql` (already applied), `backend/sessions.py`, `backend/conversations.py`, `backend/app.py`, `backend/security.py`, `backend/operations.py`.
- API/services: `app/api/conversations/route.ts`, `services/index.ts`, `services/fraud-backend.ts`, `services/operations.ts`, `types/conversations.ts`.
- UI/state: `hooks/use-workspace.ts`, `app/page.tsx`, `features/analyst/analyst.tsx`, `features/analyst/chat-history.tsx`, `components/shell.tsx`, `app/theme.css`.
- Regression coverage: `backend/tests/test_feature.py`, `tests/browser/chat-history.spec.ts`, `tests/browser/agents.spec.ts`.
- Capture script: `scripts/capture-chat-history.mjs`.

Backend middleware performs SQLite ownership binding and access auditing in the thread pool so synchronous waits cannot block streaming on the event loop. History state uses revision guards against stale refreshes. Per-tab selection uses sessionStorage keyed to the workspace recovery ID; recovery IDs are not verified staff authentication.

## Verification completed

- Production build and TypeScript checks passed.
- All 9 TypeScript data/service tests passed.
- All 41 backend tests passed against an isolated temporary database.
- After the middleware thread-pool change, all 7 focused backend checks passed, including history ownership, stream/replay isolation, form recovery, cancellation and staff roles.
- 35 unique browser checks were verified across the full run and corrected greeting-fixture rerun. The full run had 34 passes and one incorrect greeting expectation; the local router treated that fixture's risk keyword as an analytical query. A neutral greeting plus explicit agent/conversation assertions fixed the fixture, and all 5 history tests passed.
- After final sidebar layout changes, all 9 history/UI browser checks passed again against the final production build.
- The 10 final desktop/laptop/mobile captures in `artifacts/ui-audit/chat-history/index.html` and `layout.json` record zero page-width overflow and zero console/page errors. Resources/profile stay visible at laptop 1366×768 and mobile 390×844. Restored answers and mobile search/drawer captures were visually inspected.
- The earlier 120-image theme gallery remains at `artifacts/ui-audit/google-theme/index.html` as the pre-history review.

Read-only integrity checks: 10,000 original Meridian customers, 10,000 accounts, 8,000 loans and 120,000 transactions remain present. Current profiles total 10,021, including 21 added user/test profiles. Missing original IDs and checked relationship/branch/device/payment-bound violations were zero. Related synthetic records include 48,000 loan installments, 47,235 payments, 6,666 insurance records and 180,000 cashflow records. The working database was not reset or reseeded; browser tests created synthetic form-review profiles.

## Runtime at checkpoint

- Frontend: `http://127.0.0.1:3000/`, latest standalone production preview (execution session 23681).
- Backend: `http://127.0.0.1:8000/`, clean-venv Uvicorn (execution session 51918).
- Backend provider local, external transmission disabled, schema 016, ready.
- No running build/test jobs; no 3100 or 3210 preview server. Session identifiers may not survive app closure.

The production preview was used for final verification. To resume hot-reload development, stop the existing owned production listener on 3000 before starting:

```powershell
$env:RISKLENS_PYTHON='backend/.venv-clean/Scripts/python.exe'
$env:RISKLENS_AUTO_SEED='false'
npm run dev
```

Do not start a second frontend while port 3000 is occupied, or it may silently select another port.

## Next work

All local roadmap items L01–L14 and F01–F07, the Google-inspired theme and sidebar history are complete. Read `FEATURE_ROADMAP.md` for the remaining deployment boundaries.

When the user is ready for GCP, start G01 project/permissions/budget setup. Implement G04 managed database/checkpoints and G05 verified staff identities, then package a private G03 Cloud Run deployment and activate/evaluate Vertex through G02 with G09 data-handling checks. G06 storage/retention, G07 operational observability and G08 scheduling remain pending. Live Gemini, container deployment and managed-store integration have not been verified by these local tests.

Resume instruction: read this file and `FEATURE_ROADMAP.md`; do not restart the completed chat-history task. Preserve data and the approved theme. Continue GCP work only when requested/configured. No known blocking issue remains in the completed local history task.

## Guided spreadsheet import — completed 9 October 2026

The latest user authorized Excel support and asked how SQL customer databases fit. A guided CSV/XLSX wizard now supports Customers, Accounts, Transactions and Loans. Upload, select worksheet/type, map columns, preview errors and explicitly confirm. Confirm each sheet separately in parent-first order. `.sql` dumps are not executed; bank tables can be exported as CSV/Excel. Direct database connectors remain future integration work.

- Limits: 5 MB, 8 sheets, 500 records/sheet, 2,000 total records, 40 columns and 2,000 physical rows, 20 MB expanded workbook content. CSV supports UTF-8 and comma/semicolon/tab delimiters. Form PDFs/images retain their separate existing limits/flow.
- Formula/error cells, macros/external links, duplicate headers/IDs/possible people, missing parents and stale previews are blocked. Confirmation is atomic and replay-safe. Missing source risk scores persist as NULL, not zero. Unzoned timestamps use the reviewed India/UTC selection.
- New customer IDs use canonical CUS- format and remain shared across linked records. Profiles are pending verification and show Spreadsheet import; uploaded counts/filters include them. Imported loan regions derive from observed branch IDs when no synthetic master exists. YYYY-MM default observations convert to the existing snapshot representation. Repayment seeding skips imported loans; missing ledger coverage is disclosed.
- Original file bytes are discarded after parsing; staged rows, reviews, source hashes, receipts, provenance and confirmed records persist. Expiry/full deletion remain G04/G05/G06/G09. A development analyst can stage/review; confirmation requires a customer operator in the owning workspace/actor.
- Migration `016_structured_imports` is applied to the working database. Do not edit it. New backend: `backend/structured_imports.py`; related changes in `backend/data_workspace.py`, `backend/data_quality.py`, `backend/loans.py`, `backend/repayments.py`, `backend/security.py`, `backend/app.py`. Added pinned openpyxl/defusedxml dependencies to requirements and lock.
- Frontend: `features/data-workspace/import-wizard.tsx`, quality/source controls, `lib/import-mapping.ts`, `types/imports.ts`, services, `/api/imports` and `/api/import-template`. Returning to Command Center refreshes its dashboard. Templates: packaged `public/demo/banking-import-template.xlsx` and dataset-aware CSV download.
- Validation: production build/typecheck, 11 TypeScript tests, all 8 new backend import checks, 3 existing import/loan/repayment/dashboard checks, and all 4 import/quality browser checks passed. The 8-image gallery is `artifacts/ui-audit/imports/index.html`; capture script `scripts/capture-imports.mjs`. Earlier galleries/history checks remain historical evidence.
- Browser confirmations ran against an isolated snapshot under ignored `artifacts/import-browser/`. Working customer data remains 10,021 profiles / 10,000 original customers / 120,000 transactions / 8,000 loans; no reset/reseed or test customer creation in the working database during this feature. Read-only integrity checks passed on both the working database and the imported test copy. `baseFixtureVersion` preserves original provenance while import revisions change the active version; the verifier recognizes this.
- Current user-facing runtime remains production preview on 3000 and local backend on 8000. Temporary 3100/8001 QA servers are stopped after final captures. No pending import implementation remains. GCP work stays deferred.

Final import captures: 8 desktop/mobile light/dark upload/mapping screenshots; zero page-width overflow and zero console/page errors. User runtime health reports local provider, externalTransmission false, schema 016 and readyForAnalysis true. QA servers are stopped; the 3000/8000 user runtime remains running.


## BankWeave rename verification and current runtime — 9 October 2026

Production build/typecheck, 11 TypeScript tests, 3 provider checks and the existing immutable report/access test passed. Browser smoke checks covered all workspace views and light/dark desktop plus mobile, with five screenshots, zero overflow/browser errors, legacy session continuity and the BankWeave CSV template filename. See `artifacts/ui-audit/bankweave/checks.json`. A first smoke script assumed Data Workspace had a sidebar; corrected the script for the intentionally standalone view. Final mobile screenshots wait for navigation transitions to settle.

Customer integrity remains unchanged: 10,021 profiles, all 10,000 original IDs, 10,000 accounts, 8,000 loans and 120,000 transactions; fixture SHA-256 remains `aedfcc78883d6dea8bae44ada761e6fa8bd34a48bd1ce5f01fdc164af55a1f48`. No applied migration or persistent banking data was modified.

Current frontend production preview: `http://127.0.0.1:3000/`, execution session **97997**, PID **20724**. Backend: `http://127.0.0.1:8000/`, clean-venv Uvicorn execution session **1733**, PID **2980**. These replace older runtime IDs above. Provider is local, external transmission disabled, schema 016. No build/test jobs remain active. Refresh existing browser tabs to load BankWeave branding.
