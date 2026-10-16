# BankWeave AI

**Banking Intelligence & Operations** — Understand your data. Investigate risk. Act with confidence.

A local banking intelligence prototype built with Next.js, TypeScript, Tailwind, ECharts, FastAPI, LangGraph and SQLite. The Google-inspired light interface and neutral dark interface combine banking dashboards, an analytical chat workspace, investigations and reviewed data operations.

The private GCP VM uses **Gemini 3.5 Flash Lite through Vertex AI** for routing, chat, policy answers, form extraction and grounded fraud/loan explanations. KPI and chart values remain calculated by database tools. Local mode remains available without cloud credentials. Managed persistence and verified public staff sign-in are still pending.

## Run locally

Requirements: Node.js 20.9+ and Python 3.11+. Developed with Node 24 on Windows.

For a **new checkout/database**:

```powershell
git clone https://github.com/Harshilsangani/BankWeaveAI.git
cd BankWeaveAI
npm ci
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
npm run backend:migrate
npm run backend:seed
npm run dev
```

Open [BankWeave](http://127.0.0.1:3000). The launcher starts/reuses the local backend on port 8000. On macOS/Linux, use `backend/.venv/bin/python` to install Python dependencies. `RISKLENS_PYTHON` can select another environment.

**Existing workspace:** use migration and normal startup; do not reseed edited/imported banking records. Back up the application and graph checkpoint databases before upgrades. Runtime data is under ignored `backend/storage/`.

## Features and roles

- Command Center and Risk Radar share database-backed historical metrics and evidence.
- Risk Radar has independent dataset/month selection, published v2 demo rules, baseline-support and rate-growth checks, searchable severity/category/dismissal filters, and source coverage/run receipts. Every run records matches, non-matches and insufficient data; unchanged inputs reuse their recorded run. Investigations and dismissals retain the selected scope. Detection is local SQL/rules with zero model calls; trained anomaly detection and scheduled ingestion remain future work. See the [detection design and next stages](docs/architecture.md#risk-radar-detection-and-review).
- AI Analyst renders text, KPIs, interactive charts, tables, evidence and actions within one answer. Sidebar history restores separate conversations and their scope. Research mode, or a full/detailed research question, runs a scope agent, parameterized SQL tools, a chart-selection agent and a separate writing agent. Relative month windows apply to the requested transactions/cashflows rather than silently switching to fraud. The report contains detailed findings, charts, reconciled tables, limitations and actual model/tool receipts; Export PDF downloads a document with a scope/indicator overview, clickable contents, PDF bookmarks, short paragraphs, preserved Markdown headings/lists, paginated charts/tables and a binary checksum. Re-exporting an existing answer applies the current layout without changing saved research. Model failures are explicitly labeled verified-data fallbacks.
- The Analyst keeps Workspace → AI Analyst in its navigation row, with a New chat icon below the navigation. The composer’s + menu contains attachments and dataset selection. New chat appears only on AI Analyst; shared page headers keep navigation and notifications. Chat messages scroll behind its opaque background. Dropdown menus match their input width and the theme; analysis defaults to the full available history, with specific date windows requested in chat. Compact Recent chat titles and the profile remain in the sidebar; the search icon opens chat search. Dark selections use subtle white highlights. Top-customer questions return ranked records; the default basis is recorded transaction value. Tools contains Research and OCR, each with a removable selection chip. OCR shows an upload reminder and blocks message submission until a file is chosen through + → Attachment or OCR is deselected; choosing a file clears its chip and reminder. Process lists use user-facing labels.
- Knowledge Library is a labeled sidebar resource with searchable guides for all nine pages, page/resource filters, direct page links, and versioned policies. Guides remain available when dashboard or policy loading fails.
- Shared navigation stays visible while scrolling. Cards and data controls adapt to desktop, tablet and phone sizes; Settings shows the connected AI provider/model. Analyst Tools supports Escape and outside-click dismissal.
- Investigations has an owned searchable case inbox, saved Overview/Evidence/Review/Activity views, source-change checks, browser-session draft recovery, revision conflicts and required resolution notes. Source-linked relationship maps remain observed evidence. New immutable HTML reports retain the exact staff-review revision, notes, monthly/segment tables and source hash; existing cases/reports remain available. See the [investigation workflow](docs/architecture.md#investigation-inbox-evidence-and-review).
- Card Campaigns replaces Scenario Simulator: validated synthetic inputs, explainable product matches, consent-aware drafts, durable jobs, assigned dashboard reports and notifications. Admin can review report revisions, publish demo catalog versions and enable monthly schedules. Customer emails are not sent.
- Customer Workspace joins the same identities across accounts, loans, repayments, insurance, declarations and synthetic cashflow.
- CSV/Excel imports provide worksheet selection, column mapping, validation, provenance and explicit admin confirmation. Executable `.sql` dumps are not accepted.
- PDF/PNG/JPEG forms render extracted Markdown in chat. Staff correct fields and submit a locked request; an admin reviews and approves/rejects it. Submission creates no customer. Approval creates a pending-verification profile, not KYC approval or account opening.

| Role    | Access                                                                                  |
| ------- | --------------------------------------------------------------------------------------- |
| Viewer  | Browse records and available results                                                    |
| Analyst | Analyse, investigate, prepare campaigns, read assigned drafts and submit requests       |
| Admin   | Analyst access plus approvals, campaign review/catalog/schedules and record maintenance |

Settings → Local staff role switches development identities. This is a demo simulator, not sign-in; production rejects these identities until verified authentication is configured.

Start with **Why did fraud increase this month?**, follow up **Only Ahmedabad**, then **Compare it to Surat**. Open an investigation, review evidence and create a report. In Card Campaigns, select October 2026 and prepare an assigned employee report. Use Command Center → Manage customer data for records and Approval requests.

## Project structure

```text
frontend/
  src/app/           Next routes, API gateways and global style composition
  src/features/      Section-owned components, hooks, API calls, types and styles
  src/shared/        Reusable UI/analytics, transport, scope types and utilities
  public/            Browser assets and demo upload samples
  tests/             Unit, browser and isolated mock/design fixtures
backend/
  app.py             Stable Uvicorn entry point
  api/               Application composition, request context, schemas and routes
  features/          Banking domain calculations, persistence and review logic
  workflows/         LangGraph orchestration, form processing and SSE operations
  integrations/ai/   Typed provider boundary, local and Vertex implementations
  core/              Database, security, identity, privacy and generic helpers
  cli/, evaluation/  Migration CLI and local/live evaluation harnesses
  tests/             Unit and integration checks
  migrations/        Original checksummed, append-only migrations
  storage/           Local records/checkpoints (ignored; never reseed existing data)
scripts/
  runtime/           Development, production and worker launchers
  data/              Explicit synthetic generation and fixture export
  checks/            Structure, integrity, recovery and acceptance checks
  systemd/           VM service templates
demo/                Synthetic fixture generator; never imported by the application
docs/                Architecture, imports, deployment and roadmap
```

The root is an npm workspace coordinator; frontend dependencies and Next configuration belong to `frontend/`. Run the existing npm commands from the repository root. Python still starts with `backend.app:app`. Feature code imports its own contracts and API module directly; shared transport handles identity, recovery and error decoding. See the [folder ownership and call flow](docs/architecture.md#source-ownership-and-call-flow) before adding files.

There is one application backend. Mock analytics/report helpers live only in test fixtures; application routes do not fall back to client-supplied report data.

On the current Linux VM, frontend and backend run as independently supervised services: `npm run frontend:start` serves the Next production build on port 3000, and the backend launcher runs FastAPI/Uvicorn on port 8000. The browser uses the same-origin Next gateway. See [VM service configuration](docs/deployment.md#independent-frontend-and-backend-services).

## Validation

```powershell
npm run check:structure
npm run typecheck
npm test
npm run test:backend
npm run evaluate
npm run test:e2e
npm run build
npm start
```

Opt-in live Gemini acceptance (billable; all test writes use a disposable copy of the existing database):

```bash
backend/.venv/bin/python -m backend.evaluation.vertex --allow-live \
  --storage /home/harshilsangani07/bankweave-state/storage \
  --project ai-builders-cup --location global --model gemini-3.5-flash-lite
```

See [Vertex activation and browser acceptance](docs/deployment.md#vertex-activation-on-the-private-vm) for the runtime settings and isolated browser checks.

Browser tests use Edge on Windows; elsewhere install Chromium with `npx playwright install chromium`. Run write/approval/import tests against an isolated database copy, not a working directory with records you want to preserve. Generated screenshots and test snapshots stay under ignored `artifacts/`.

Read-only customer integrity: `node scripts/runtime/python.mjs scripts/checks/verify_customer_integrity.py`.
Three-process approval/restart recovery: `node scripts/runtime/python.mjs scripts/checks/verify_recovery.py`.

## Data boundaries and documentation

Meridian contains 10,000 synthetic customers, 120,000 transactions and 8,000 loans, covering April–September 2026. Fraud flags rise 833 → 1,091 and loan default markers 648 → 765. Exposure is flagged transaction value/defaulted-principal proxy, **not confirmed loss**. Products, cashflow observations and scenario assumptions are synthetic. Five-year credit history and verified original debit/credit direction are unavailable.

BankShield is a separate historical USD synthetic sample with incomplete joins. Missing customers, devices, loans or branches are not invented. See [data sources and audit](docs/data-sources.md).

- [Architecture, agents, roles and approvals](docs/architecture.md)
- [Card Campaigns design and worker operations](docs/card-campaigns-plan.md)
- [Complete GCP migration handoff for the next agent](docs/gcp-handoff.md)
- [CSV/Excel import guide](docs/imports.md)
- [Packaging, deployment and Gemini chart design](docs/deployment.md)
- [Current implementation and remaining GCP tasks](docs/roadmap.md)

The product was renamed from RiskLens. Preserve `RISKLENS_*` environment names, `x-risklens-*` headers, legacy actor/session/storage keys and database/container identifiers. These keep existing records and chats accessible. Historical immutable artifacts keep their original provenance.
