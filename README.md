# BankWeave AI

Banking intelligence and reviewed operations, built with Next.js, TypeScript, FastAPI, LangGraph and SQLite. Staff can ask questions, inspect source evidence, investigate risk, review uploaded forms and prepare card campaigns in one workspace.

**[Open the live demo](https://35.253.137.87)** · [Reviewer walkthrough](docs/judge-demo-guide.md) · [Architecture](docs/architecture.md)

The hosted demonstration uses synthetic data and server-side Gemini through Vertex AI. Visitors need no login or API key. The role selector simulates Analyst, Admin and Viewer permissions; changes in this shared demo may be visible to other visitors. Real email delivery is disabled. Local installations default to a deterministic provider and require no Google credentials.

## Features

| Area                | What reviewers can try                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command Center      | Historical metrics, regional trends, risk queue, saved investigations and assigned campaign reports.                                                                                    |
| AI Analyst          | Scoped banking questions, follow-ups, charts, tables, evidence and separate saved conversations. Research exports include source and execution receipts.                                |
| Risk Radar          | Published SQL rules, month/dataset filters, source coverage and dated overdue-principal evidence.                                                                                       |
| Investigations      | Searchable saved cases, observed relationship maps, notes, conflict handling, required resolution notes and immutable reports. An optional review assistant prepares a brief for staff. |
| Forms and approvals | PDF/image extraction, corrections, original attachment downloads and explicit Admin decisions. Approval creates a profile pending verification.                                         |
| Data Workspace      | Linked customer/product records, KYC review, recorded maintenance and validated CSV/Excel imports. Shared banking imports are Admin-only.                                               |
| Card Campaigns      | Reproducible synthetic inputs, explainable product matches, saved email drafts, background jobs, assigned reports and Admin review.                                                     |
| Knowledge           | Exact versioned policy sections, ranked search and in-app page guides.                                                                                                                  |

Analysts analyse data and submit requests. Admins also approve requests, apply shared-data imports, publish policy/product versions and review campaigns. Viewers have read access. The backend enforces permissions; see [roles and approvals](docs/architecture.md#roles-and-approvals).

## Quick start

Use **Node.js 24**, **Python 3.11** and Git. First installation needs internet access for dependencies and the pinned public BankShield sample. Run these commands from the repository root against a **new workspace**.

### Linux / macOS

```bash
git clone https://github.com/Harshilsangani/BankWeaveAI.git
cd BankWeaveAI
npm ci
python3.11 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock.txt
cp .env.example .env
npm run backend:migrate
npm run backend:seed
npm run campaigns:generate
npm run dev
```

### Windows PowerShell

```powershell
git clone https://github.com/Harshilsangani/BankWeaveAI.git
cd BankWeaveAI
npm ci
py -3.11 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
Copy-Item .env.example .env
npm run backend:migrate
npm run backend:seed
npm run campaigns:generate
npm run dev
```

Open **http://127.0.0.1:3000** and keep the terminal running. The launcher loads the root `.env` and starts the frontend, API and campaign worker. If it reuses an API already on port 8000, that API's worker must be managed separately.

On Debian/Ubuntu, scanned-image OCR needs `libgl1`, `libglib2.0-0` (`libglib2.0-0t64` on some releases) and fonts such as `fonts-dejavu-core`. Digital PDF extraction does not need the image OCR reader. On Windows without `py`, use your Python 3.11 executable.

For a production build locally:

```bash
npm run build
npm start
```

**Existing workspace:** never repeat `backend:seed` over edited/imported records. It replaces source dataset rows. Normal startup applies pending migrations without seeding. Back up the application and checkpoint databases together before upgrading. `.env`, credentials, databases and saved chats/reports stay outside Git.

## Configuration

| Setting                                                                  | Default / purpose                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `RISKLENS_PROVIDER`                                                      | `local`; use `vertex` to opt into Gemini.                          |
| `RISKLENS_ENABLE_VERTEX`                                                 | `false`; must be `true` for cloud calls.                           |
| `RISKLENS_GCP_PROJECT`, `RISKLENS_GCP_LOCATION`, `RISKLENS_VERTEX_MODEL` | Explicit Vertex project, location and model.                       |
| `RISKLENS_STORAGE_DIR`                                                   | `backend/storage`; contains banking records and graph checkpoints. |
| `RISKLENS_DB`, `RISKLENS_CHECKPOINT_DB`                                  | Optional explicit SQLite paths.                                    |
| `BANKWEAVE_EMAIL_ENABLED`                                                | `false`; campaign previews/reviews work without SMTP.              |

Copy `.env.example` to a private root `.env`. The npm launchers load it for their child processes; direct Python commands need their environment configured explicitly. The tested hosted model is **`gemini-3.5-flash-lite`** in `global`. Check Settings and each saved response's execution receipt for the actual model/status.

Using your own Vertex project requires billing, API access, suitable IAM permissions and **Application Default Credentials**. The adapter uses `google.genai.Client(vertexai=True, ...)`; an AI Studio API key does not configure it. [Deployment and Vertex setup](docs/deployment.md#vertex-activation-on-the-private-vm) includes the commands. No reviewer needs the owner's credentials.

Optional SMTP delivery is Admin-only, requires a reviewed report and is restricted to the configured test inbox. Keep it disabled for ordinary review. See [test email configuration](docs/deployment.md#campaign-test-email-configuration).

## Submission walkthrough

1. In **Settings**, inspect the AI connection and simulated staff role.
2. In **AI Analyst**, ask “Why did fraud increase in September 2026 compared with August 2026?”, then “Only Ahmedabad”. Inspect the chart, table and evidence. Use Research for a detailed report and export its PDF.
3. In **Risk Radar**, select Meridian / September 2026. Open a signal, inspect evidence and policy references, save a case note and export an investigation report.
4. As Analyst, upload the [three-page synthetic form](frontend/tests/fixtures/meridian-three-page-application.pdf). Review/correct the extracted fields and submit for approval. Switch to Admin and review it in **Data Workspace → Approval requests**. New uploads retain the original file for workspace-owned download; older uploads without a source show **Original unavailable**.
5. Prepare an October 2026 **Card Campaigns** report. Inspect eligibility reasons and email drafts, then record the Admin review. The public demo does not send email.
6. Search **Knowledge** for “odd transfers” or “know your customer” and open an exact source section. Browse customer records and source coverage in Data Workspace.

## Project structure

```text
frontend/
  src/app/           Next routes, same-origin API gateways and global styles
  src/features/      Section-owned components, hooks, API contracts and styles
  src/shared/        Reusable UI, analytics, transport and utilities
  public/            Browser assets and synthetic upload samples
  tests/             Unit tests, browser tests and test-only fixtures
backend/
  api/               FastAPI composition, context, schemas and routes
  features/          Banking calculations, persistence and review workflows
  workflows/         LangGraph orchestration, form processing and streaming
  integrations/ai/   Typed local and Vertex provider implementations
  core/              Database, security, identity and generic helpers
  migrations/        Append-only, checksummed SQL migrations
  cli/, evaluation/  Migration and evaluation entry points
  tests/             Unit and integration tests
scripts/
  runtime/           App and worker launchers
  data/              Explicit synthetic generation and fixture export
  checks/            Structure, integrity, recovery and publication checks
  systemd/           VM service and public gateway templates
demo/                Deterministic synthetic fixture generator
docs/                Architecture, data, imports, deployment and review guides
```

The root npm workspace coordinates the frontend package. Python's stable entry point is `backend.app:app`. Production routes use the FastAPI backend; mocks remain in test fixtures. [Source ownership and call flow](docs/architecture.md#source-ownership-and-call-flow) describes the boundaries.

## Validation

After a fresh local setup:

```bash
npm ci
npm run check:secrets
npm run check:structure
npm run typecheck
npm test
npm run test:backend
npm run evaluate
npm run build
```

Browser tests **write records**. Use disposable storage and separate app ports, then set `RISKLENS_BROWSER_BASE_URL` to that test frontend before running `npm run test:e2e`. On Linux/macOS, install the browser first with `npx playwright install chromium`; Windows uses Edge. Avoid the hosted or working databases. [Deployment checks](docs/deployment.md#validation-and-safe-upgrades) cover recovery and opt-in billable Vertex evaluation.

Both npm and Python lockfiles are committed. `backend/requirements.txt` lists direct dependencies; `backend/requirements.lock.txt` pins the complete Python environment. Generated output, local presentation notes and runtime credentials are excluded from publication.

## Data boundaries and documentation

Meridian has 10,000 synthetic customers, 120,000 transactions and 8,000 loans covering April–September 2026. Campaign-only observations are generated separately. BankShield is a pinned historical USD synthetic sample with incomplete relationships. Missing joins or unsupported history remain explicit. Risk flags and exposed principal are review evidence, not confirmed losses or automated credit decisions.

Verified individual staff sign-in, managed database/artifact storage, full retention/deletion controls and production cloud deployment remain pending. See the [current state and roadmap](docs/roadmap.md).

- [Reviewer guide](docs/judge-demo-guide.md)
- [Architecture, agents, roles and workflows](docs/architecture.md)
- [Data sources and synthetic generation](docs/data-sources.md)
- [CSV/Excel imports](docs/imports.md)
- [Deployment, backups and optional integrations](docs/deployment.md)

The former RiskLens name remains in `RISKLENS_*`, `x-risklens-*` headers and legacy storage identifiers to preserve saved-work compatibility.
