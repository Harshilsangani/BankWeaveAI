# BankWeave AI

**Banking Intelligence & Operations** — Understand your data. Investigate risk. Act with confidence.

A local banking intelligence prototype built with Next.js, TypeScript, Tailwind, Recharts, FastAPI, LangGraph and SQLite. The Google-inspired light/dark interface combines banking dashboards, an analytical chat workspace, investigations and reviewed data operations.

Gemini and GCP are not connected yet. Local routing/chat are deterministic, analyses use database tools, and printed-form OCR runs locally.

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
- AI Analyst renders text, KPIs, interactive charts, tables, evidence and actions within one answer. Sidebar history restores separate conversations and their scope.
- Investigations retain case notes, source-linked relationship maps and immutable HTML reports.
- Customer Workspace joins the same identities across accounts, loans, repayments, insurance, declarations and synthetic cashflow.
- CSV/Excel imports provide worksheet selection, column mapping, validation, provenance and explicit admin confirmation. Executable `.sql` dumps are not accepted.
- PDF/PNG/JPEG forms render extracted Markdown in chat. Staff correct fields and submit a locked request; an admin reviews and approves/rejects it. Submission creates no customer. Approval creates a pending-verification profile, not KYC approval or account opening.

| Role    | Access                                                                |
| ------- | --------------------------------------------------------------------- |
| Viewer  | Browse records and available results                                  |
| Analyst | Analyse, investigate, extract/correct forms and submit requests       |
| Admin   | Analyst access plus approval decisions and banking record maintenance |

Settings → Local staff role switches development identities. This is a demo simulator, not sign-in; production rejects these identities until verified authentication is configured.

Start with **Why did fraud increase this month?**, follow up **Only Ahmedabad**, then **Compare it to Surat**. Open an investigation, review evidence, run an illustrative scenario and create a report. Use Command Center → Manage customer data for records and Approval requests.

## Project structure

```text
app/               Next.js UI and same-origin API gateways
components/        Shared shell, analytical blocks and charts
features/          Banking screens and staff workflows
services/          HTTP client, interfaces and backend gateway
backend/           FastAPI, LangGraph, SQL tools and providers
backend/migrations/ Checksummed, append-only schema migrations
backend/storage/   Local datasets/databases/checkpoints (ignored)
data/              Coherent synthetic fixture generator
hooks/, lib/, types/ Shared state, utilities and contracts
tests/             Unit/browser checks; reference mocks in fixtures/
scripts/           Startup, export, evaluation and recovery utilities
docs/              Current architecture, imports, deployment and roadmap
```

There is one application backend. Mock analytics/report helpers live only in test fixtures; application routes do not fall back to client-supplied report data.

## Validation

```powershell
npm run typecheck
npm test
npm run test:backend
npm run evaluate
npm run test:e2e
npm run build
npm start
```

Browser tests use Edge on Windows; elsewhere install Chromium with `npx playwright install chromium`. Run write/approval/import tests against an isolated database copy, not a working directory with records you want to preserve. Generated screenshots and test snapshots stay under ignored `artifacts/`.

Read-only customer integrity: `node scripts/python.mjs scripts/verify_customer_integrity.py`.
Three-process approval/restart recovery: `node scripts/python.mjs scripts/verify_recovery.py`.

## Data boundaries and documentation

Meridian contains 10,000 synthetic customers, 120,000 transactions and 8,000 loans, covering April–September 2026. Fraud flags rise 833 → 1,091 and loan default markers 648 → 765. Exposure is flagged transaction value/defaulted-principal proxy, **not confirmed loss**. Products, cashflow observations and scenario assumptions are synthetic. Five-year credit history and verified original debit/credit direction are unavailable.

BankShield is a separate historical USD synthetic sample with incomplete joins. Missing customers, devices, loans or branches are not invented. See [data sources and audit](docs/data-sources.md).

- [Architecture, agents, roles and approvals](docs/architecture.md)
- [Complete GCP migration handoff for the next agent](docs/gcp-handoff.md)
- [CSV/Excel import guide](docs/imports.md)
- [Packaging, deployment and Gemini chart design](docs/deployment.md)
- [Current implementation and remaining GCP tasks](docs/roadmap.md)

The product was renamed from RiskLens. Preserve `RISKLENS_*` environment names, `x-risklens-*` headers, legacy actor/session/storage keys and database/container identifiers. These keep existing records and chats accessible. Historical immutable artifacts keep their original provenance.
