# Local packaging and GCP handoff

For the receiving agent, read the [complete GCP migration handoff](gcp-handoff.md) first. It records current features, source/state transfer requirements, private-VM restore, authentication/provider blockers and acceptance checks. This document supplies the detailed packaging and future managed-deployment reference.

## Repeatable local setup

Use Node 24 and Python 3.11. Create a fresh virtual environment without `--system-site-packages`. Run `npm ci`, then install `backend/requirements.lock.txt`. Apply `npm run backend:migrate`, then explicitly run `npm run backend:seed`. Start with `npm run dev`. Migration never seeds or clears source records; automatic seeding is disabled unless explicitly enabled in development.

`schema_migrations` records checksummed SQL files. Add a new migration instead of modifying an applied file. A failed upgrade rolls back its schema changes. Back up both the application database and graph checkpoints before upgrades. `scripts/verify_recovery.py` tests preserved edits, pending admin requests and idempotent approval across three fresh processes.

The `.env.example` documents disabled cloud defaults. Next reads `.env.local`; export backend settings in the process environment. Never put credentials in browser-exposed `NEXT_PUBLIC_*` variables. The Gen AI SDK is installed for adapter contract tests; installation does not activate cloud requests.

## Private container demo

The frontend Dockerfile packages Next's standalone output. The backend image runs migrations, then FastAPI under an unprivileged user. Health checks and bounded requests are included. `compose.yaml` binds development services to loopback and mounts `/data` for SQLite/checkpoints.

Before the first container seed, export the fixture with `node --import tsx scripts/export-demo.ts`. After building and starting the backend, copy `backend/storage/meridian.json` into `/data/meridian.json` using `docker compose cp`, then run `docker compose exec backend python -m backend.import_data`. Subsequent restarts do not seed. BankShield is fetched only by the explicit seed command.

Docker is not installed on the development machine used for these changes. Image build, Linux OCR libraries, compose startup and Cloud Run ingress/streaming need container validation before release. Production backend images reject development identity headers; do not treat a healthy container as an authenticated public product.

## Durable database/checkpoint migration — G04

SQLite is the implemented local driver. Database and checkpoint paths are independently configurable; unsupported drivers fail explicitly. Managed SQL/checkpoint stores are not implemented or tested yet.

Include the `conversations` table introduced by migration `015_conversations`. Preserve its workspace foreign key, per-chat scope/message references and active-conversation state along with `session_artifacts`; test reopening two chats and a reviewed form after migration/redeployment.

Also preserve the submitted snapshots, request ownership, decisions and events in migration `017_admin_approvals`. Verify pending staff-request recovery, cross-tenant rejection, atomic approval and replay after migration. Keep application records and graph checkpoints as a matched set.

At G04 choose one managed relational store, implement its connection/transaction adapter and translate SQLite-specific JSON/date queries. Use a compatible durable LangGraph saver instead of container-local checkpoint files. Export every applied migration's canonical tables with `(dataset, id)` identities and integer monetary units: source records, profiles/form versions, sessions, artifacts/report files, cases/dispositions, policy library, detector runs, import previews/receipts, repayments, insurance, preferences/recommendation runs/reviews, cashflow, KYC cases, maintenance receipts/events and audits. Migrate graph checkpoints as a matched set. Import to a staging schema, reconcile source counts/hashes and recover a pending review before switching traffic. Keep BankShield's incomplete relationships visible.

Do not run the fixture seed over migrated source data. The seed intentionally replaces original banking fixture tables; generated product inserts and reviewed profile edits are preserved, but that is not an import/migration strategy. Back up local databases before any explicit reseed.

For rollback, stop writes, restore the application/checkpoint backups as a matched pair, point a private runtime back to the previous schema and verify that repeated confirmation cannot add a second customer. Do not apply destructive down-migrations to edited banking records. Backup recovery in the actual managed store remains a live G04 acceptance check.

## Activation remains pending

G01 project/billing; G02 live Gemini; G03 container deployment; G04 managed durability; G05 verified staff identities; G06 private retained artifacts; G07 cloud telemetry/limits; G08 scheduled jobs; G09 verified data handling. Production currently fails closed for staff requests until identity integration is configured.

### Reviewed file imports in managed storage

Migration `016_structured_imports` adds `file_import_uploads`, `file_import_reviews` and `record_import_sources`. G04 must migrate their contents, ownership and immutable receipt references. G06/G09 must define retention/expiry/deletion for parsed staging rows, reviews and receipts: the original file bytes are discarded, but parsed information remains. G05 must replace development actors and define any cross-staff review handoff; local staged imports are scoped to their originating workspace/actor. Do not deploy an arbitrary SQL-file execution endpoint.

## Gemini and chart responses

Research checked 9 October 2026; this remains a deployment design, not an activated feature.

### Can Gemini return a chart?

Yes. Supported models can generate and execute Python, including Matplotlib graphs returned as inline bytes/images. Our application must read those image parts and render them in chat. A chart image is a static artifact, rather than our current interactive Recharts component. Google's cloud documentation lists graph output, a 30-second code-execution limit and token-based billing without a separate charge simply for enabling the tool. Confirm support for the exact model/location selected at deployment. [Google code execution documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tools/code-execution).

### Recommended approach for this product

Keep the existing interactive charts and rich answer blocks. No separate paid chart service is required. This recommendation is based on BankWeave's current Recharts/SQL architecture and the need for figures that reconcile with evidence.

1. Authenticate staff and enforce the requested dataset, tenant, customer and permissions on the backend.
2. Gemini proposes a bounded analytical request. Our approved read functions execute parameterized SQL and calculate the figures. Function calling returns a proposed tool name/arguments; our application performs the actual call. Never expose an unrestricted database connection, generated SQL execution or admin-write tools to the model. [Google function calling documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tools/function-calling).
3. Give Gemini only the authorized, necessary aggregates and evidence references to explain the result. Use a constrained response schema for explanation and chart selection; validate the returned structure and references again in Python. Structured output helps constrain JSON shape, but does not prove a numerical claim. [Google structured output documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output).
4. The backend assembles `TEXT` → `KPI` → `CHART` → optional `TABLE`/`EVIDENCE` blocks. Chart points come from the same verified query result as the figures, with currency, period and scope attached. Gemini may choose an allowed chart kind/series reference; it must not invent or replace point values.
5. React renders the explanation and graph consecutively in the same answer. We already do this for local fraud and loan analyses. At G02, add model-assisted explanation/chart planning through this boundary and evaluate it with fake and live providers. The current Vertex adapter covers routing, general chat, grounded policy answers and extraction; it does not yet produce database-grounded analytical narration.

Use code-execution chart images later for specialist export/one-off plots if useful. They are optional; do not run model-generated JavaScript or Python in our own banking backend to draw routine charts.

### Five-year credit coverage

First define **credit**: loan disbursements, outstanding loan balances at a date, or incoming account credits. These require different queries; balances must not be added together across successive snapshots.

The Meridian transaction fixture covers April–September 2026, and original transactions lack verified debit/credit direction. It cannot provide a five-year credit graph. The local analyst now states the coverage gap without making up points. A future historical dataset needs dated records for every requested year, metric/direction, amount in minor units, currency, branch/customer links, status, source references and completeness. Extend the historical dataset/import contracts as well as the analytical tool; current import periods are intentionally bounded.

### Credit eligibility

Use the Google-hosted Gemini/Vertex route and Cloud Run for the existing backend/frontend when deployment begins. Cloud Run provides pay-per-use execution and a free tier; a dedicated chart hosting service adds no value here. [Cloud Run pricing](https://cloud.google.com/run/pricing).

If the $300 balance is the standard Welcome credit, it expires within 90 days and applies to eligible Google Cloud usage. Google's current terms exclude Gemini API costs in AI Studio and partner-model managed APIs. Do not assume every Gemini endpoint uses the credit. Check the actual credit grant, billing project, eligible SKUs and model access before activation; this project has not inspected the user's billing balance. [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features).

Verified identity, managed persistence, billing controls and live Gemini evaluation remain the deployment roadmap prerequisites. No cloud resource was provisioned or credit spent during this research.
