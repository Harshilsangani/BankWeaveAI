# BankWeave AI

**Banking Intelligence & Operations** — Understand your data. Investigate risk. Act with confidence.

A local banking intelligence and operations prototype with a FastAPI, LangGraph and SQLite backend for fraud/loan analysis, customer products, form onboarding and staff review. Built with Next.js, React, TypeScript, Tailwind CSS, Radix accessible dialogs, Lucide icons, and Recharts.

The product was renamed from RiskLens AI to BankWeave AI on 9 October 2026. Existing `RISKLENS_*` configuration names, `x-risklens-*` request headers, browser storage keys, SQLite filenames and container volume names remain compatibility identifiers. Keep them when configuring or resuming an existing workspace so its data and saved chats stay accessible. Previously saved immutable reports and source metadata retain their original provenance; newly generated reports use BankWeave branding.

The data workspace includes a guided CSV/Excel importer for customers, accounts, transactions and loans: select a sheet, map columns, validate rows and explicitly confirm an append. Templates, downloadable row errors and owned review history are included. See [supported formats and import boundaries](IMPORT_GUIDE.md). SQL database tables can be exported to CSV/Excel; executable `.sql` dumps are not accepted.

## Run locally

```sh
git clone https://github.com/Harshilsangani/BankWeaveAI.git
cd BankWeaveAI
npm ci
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
npm run backend:migrate
npm run backend:seed
npm run dev
```

Open http://127.0.0.1:3000. Node.js 20.9+ is required (developed with Node 24). No credentials or cloud services are required. The local SQLite backend is started automatically. See [backend setup and agent workflow](backend/README.md).

```sh
npm run typecheck
npm test
npm run test:backend
npm run test:e2e
npm run build
npm start
```

The browser tests automatically start or reuse the local server. They use Edge on Windows; on other platforms, first run `npx playwright install chromium`. Screenshots are saved under `artifacts/`.

## Demo path

1. In Command Center, select **Open AI Analyst**, then ask **Why did fraud increase this month?** AI Analyst is the single chat workspace.
2. Follow up with **Only Ahmedabad**, then **Compare it to Surat**. The context panel displays the active scope.
3. Open the investigation workspace and expand the source evidence.
4. Run a stronger-authentication scenario; adjust coverage, effectiveness, and challenge abandonment.
5. Create a report and download the standalone HTML document. Open the document in a browser to print or save as PDF.

The sidebar also provides Risk Radar filters and reversible local dismissal, a report library, searchable demonstration policies, appearance settings, notifications, and a Ctrl/Cmd+K command palette. Mobile navigation and light mode are included.

**Recent chats** in the left sidebar saves separate conversations with automatic titles and Today/Yesterday/Earlier groups. Use its search to find a chat, select it to restore rich answers and form reviews, or choose **New chat** to start again. Changing the dataset/month starts a separate analysis while preserving the previous conversation. Chats persist in SQLite; each browser tab remembers its selection across reloads. Switching is disabled while a request or context update is running.

Open the standalone **Data Workspace** using **Manage customer data** from Command Center; its back button returns to Command Center. The customer directory supports manual create/edit/delete and includes profiles saved from uploaded forms. Each original customer retains the same ID across accounts, loans, repayments, insurance, declared needs/recommendations, synthetic cashflow and KYC review. Source records provide read-only search and pagination for customers, accounts, loans, transactions, fraud alerts and devices. Local changes persist in SQLite; linked-product checks, stale-record checks and audit entries apply to directory mutations.

Customer **Record maintenance** provides typed account-observation creation, policy creation/status/nominee updates and principal-payment recording. Operators confirm a reason before each write. Stable request IDs recover lost responses, and guarded reversal preserves actor history. These workflows record synthetic observations; they do not open real accounts, enroll customers in insurance or execute payments.

## Architecture

```text
app/                     Next.js entry, metadata, theme and responsive styles
app/api/                 Service-boundary routes proxying FastAPI over HTTP
components/              Reusable analytical blocks, charts, shell and primitives
features/                Dashboard, analyst, risk, investigation, simulator, resources
services/contracts.ts    BankDataService, AnalyticsService, AIService, RiskService, ReportService
services/index.ts        HTTP composition root (fetch client) and stable service functions
services/mock.ts         Deterministic demo adapter and query-intent handling
services/analytics.ts    Filtering, aggregation, comparisons, evidence
data/banking.ts          Related synthetic fixture and fictional policies
types/                   Domain models and discriminated response-block union
hooks/                   Workspace lifecycle, async actions and operational progress
lib/                     Formatting and canonical report download client
tests/                   Data integrity, context, scenario and report checks
```

UI features consume service functions through Next.js API routes. Fraud analysis, evidence, scenarios, reports and customer form onboarding proxy to the local FastAPI backend. Dashboard, Radar and loan analysis use backend SQL. The Knowledge library stores versioned policies and returns cited sections through a dedicated LangGraph node. See [backend architecture](backend/README.md) and [BankShield audit](artifacts/bankshield-review/REVIEW.md).

## Synthetic dataset and definitions

- 10,000 customers and related accounts, 120,000 transactions, 8,000 loans, four branches, fraud alerts and customer risk scores.
- Six monthly periods: April–September 2026. The default analytical comparison is September versus August.
- Flagged transactions rise from 833 to 1,091. Ahmedabad rises from 333 to 650 while other regions partially offset the increase. New devices and repeated device identifiers form an intentional investigative pattern.
- Defaults rise from 648 to 765 on a fixed population of 8,000 loans.
- 48,000 dated synthetic installments and recorded principal payments use those 8,000 loan IDs. Generation assumes 48 equal principal installments, with only April–September observations supplied; interest, fees and earlier payments are unavailable.
- 6,666 synthetic insurance policies and 10,000 labelled synthetic needs/consent declarations reuse the fixture customer IDs. Staff suggestions use declared needs, consent and recorded products/repayment facts; they do not infer suitability from demographics or perform enrollment/contact.
- Synthetic incoming observations and opening balances are generated explicitly. Original fixture transactions have no verified debit/credit direction, so their outgoing classification is labelled synthetic. Cashflow is descriptive, not verified salary, a financial-health score or an affordability decision.
- Exposure means the sum of flagged transaction amounts or defaulted-loan principal proxies, **not confirmed losses**.
- Authentication simulation: projected exposure = baseline × (1 − coverage × effectiveness). Effectiveness and abandonment are user assumptions, not measured predictions.

## Boundaries and local state

The two analysis datasets are synthetic. Gemini is disconnected. Fraud responses use SQL aggregates and actual LangGraph routing; general chat is locally scripted. Scanned PDFs/images produce Markdown using local OCR, followed by editable customer fields and an explicit review interrupt before a database write. Uploaded forms may contain user-supplied data: use fictional forms for this demo. Saving a customer creates a pending-verification profile, not an approved KYC decision or opened account.

Backend artifacts, customer drafts/profiles and LangGraph checkpoints persist in SQLite. Session-scoped conversation, dataset/month, active investigation, report references and corrected/saved form reviews restore from backend storage. The browser retains a recovery key and theme; dismissed alerts are audited in the backend. Policy retrieval uses versioned local chunks. Risk Radar consumes recorded, versioned detector runs and remains a historical snapshot. Local staff roles enforce API/tool permissions, with development identities rejected in production. Verified cloud authentication remains pending. See [backend limitations and deployment prerequisites](backend/README.md).

See [packaging, migrations and GCP handoff](DEPLOYMENT.md) and [feature completion status](FEATURE_ROADMAP.md). Automatic seeding is disabled by default. Docker image validation and managed-cloud durability remain deployment checks.

Run `node scripts/python.mjs scripts/verify_customer_integrity.py` for a read-only check of current fixture IDs, customer/product parents, loan branches, device references and principal-payment bounds. The latest recorded check is [customer-integrity.json](artifacts/customer-integrity.json).

Operational requests stream safe backend events with cancellation and saved-result replay. Reports download immutable server-generated HTML with actor-attributed access logs. **Data quality & imports** in the standalone Data Workspace shows relationship gaps and supports an explicit, reviewed CSV transaction append (up to 500 rows). Schema/currency/date/parent/duplicate checks run before and during the atomic write. Account, loan and customer tables do not receive generic row-edit access.

Fraud investigations include bounded, interactive relationship maps from recorded customer/account/transaction/device links; correlation is not proof of collusion. KYC cases retain extraction provenance, missing evidence, reviewer notes and revisions. Adding a profile or marking a case reviewed never approves identity verification. Saved investigations/reports retain their original source facts.

Explicit fixture re-seeding replaces source banking fixture tables. Back up edited/imported records before using it; migration and ordinary startup never reseed. Reviewed customer profiles and generated product/review histories are preserved with idempotent seed inserts.
