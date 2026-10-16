# Local packaging and GCP handoff

For the receiving agent, read the [complete GCP migration handoff](gcp-handoff.md) first. It records current features, source/state transfer requirements, private-VM restore, authentication/provider blockers and acceptance checks. This document supplies the detailed packaging and future managed-deployment reference.

## Repeatable local setup

Use Node 24 and Python 3.11. Create a fresh virtual environment without `--system-site-packages`. Run `npm ci`, then install `backend/requirements.lock.txt`. Apply `npm run backend:migrate`, then explicitly run `npm run backend:seed`. Start with `npm run dev`. Migration never seeds or clears source records; automatic seeding is disabled unless explicitly enabled in development.

`schema_migrations` records checksummed SQL files. Add a new migration instead of modifying an applied file. A failed upgrade rolls back its schema changes. Back up both the application database and graph checkpoints before upgrades. `scripts/checks/verify_recovery.py` tests preserved edits, pending admin requests and idempotent approval across three fresh processes.

The `.env.example` documents disabled cloud defaults. Next reads `.env.local`; export backend settings in the process environment. Never put credentials in browser-exposed `NEXT_PUBLIC_*` variables. The Gen AI SDK is installed for adapter contract tests; installation does not activate cloud requests.

## Private container demo

The `frontend/Dockerfile` packages Next's standalone output. The backend image runs migrations, then FastAPI under an unprivileged user. Health checks and bounded requests are included. `compose.yaml` binds development services to loopback and mounts `/data` for SQLite/checkpoints.

Before the first container seed, export the fixture with `node --import tsx scripts/data/export-demo.ts`. After building and starting the backend, copy `backend/storage/meridian.json` into `/data/meridian.json` using `docker compose cp`, then run `docker compose exec backend python -m backend.features.datasets.demo_import`. Subsequent restarts do not seed. BankShield is fetched only by the explicit seed command.

Docker is not installed on the development machine used for these changes. Image build, Linux OCR libraries, compose startup and Cloud Run ingress/streaming need container validation before release. Production backend images reject development identity headers; do not treat a healthy container as an authenticated public product.

## Durable database/checkpoint migration — G04

### Private VM restore and host startup

`compose.vm.yaml` supplies the private VM bind mount. Set `BANKWEAVE_STORAGE_DIR` to the absolute restored directory, then resolve `docker compose -f compose.yaml -f compose.vm.yaml config` before startup. The override replaces the named volume at `/data`, sets both database paths and disables auto-seeding. Missing host directories are not automatically created. Backend container UID 1001 must have access; verify ownership before running containers.

The current working directory on the VM is `/home/harshilsangani07/bankweave-state/storage`, outside Git and the image context. On 12 October 2026 the owner explicitly selected a fresh synthetic dataset; this directory is now populated and must not be reseeded or overwritten by a later Windows transfer. The initial matched state is backed up under `/home/harshilsangani07/bankweave-state/backups/fresh-initial-20261012`. For a future saved-state restore, transfer consistent SQLite backups, `meridian.json` and the matching BankShield cache into a separate private directory, verify it and plan the cutover deliberately.

Run the read-only preflight after transfer:

```bash
backend/.venv/bin/python scripts/checks/verify_vm_state.py \
  --storage /home/harshilsangani07/bankweave-state/storage
```

It checks both SQLite files, checkpoint tables, applied migration checksums/current schema, stored HTML report hashes, original Meridian IDs/product links and the pinned BankShield cache hashes when that dataset is present. It emits counts/hashes, not customer content. It does not prove that the backups were captured as a consistent pair or restore browser ownership handles. Pending migrations fail preflight; reconcile the source and apply migrations deliberately after backing up, then repeat the check.

If Docker administration is unavailable, the host-process launcher uses the installed Python environment and built Next standalone server:

```bash
export PATH="$HOME/.local/bin:$PATH"
export BANKWEAVE_STORAGE_DIR="$HOME/bankweave-state/storage"
# Required on the current VM, where OCR libraries were installed under this account:
export BANKWEAVE_LIBRARY_DIR="$HOME/.local/share/bankweave/system-packages/usr/lib/x86_64-linux-gnu"
bash scripts/runtime/start-private-vm.sh
```

This launcher validates restored state first, refuses occupied application ports, disables auto-seeding/Vertex, and binds frontend/backend to `127.0.0.1:3000/8000`. Access is through an SSH tunnel. It is a private development-identity demo and remains a foreground process; service supervision, reboot recovery and Docker image acceptance are not established by this fallback. `npm start` now uses `frontend/.next/standalone/frontend/server.js` and copies public/static assets into the standalone output. Fixture export honors `RISKLENS_STORAGE_DIR` and preserves an existing fixture byte-for-byte.

The original combined user-level `bankweave-private.service` has been disabled and retained as a rollback option. The VM now uses the independent services below, grouped by the enabled `bankweave-private.target`. User lingering remains enabled. Do not start a foreground launcher or the old combined unit while the new services own ports 3000/8000. Actual VM reboot recovery, Docker image acceptance and public authenticated ingress remain untested/pending. These user services do not require Docker or passwordless sudo.

### Independent frontend and backend services

On 13 October 2026, the owner requested detached `nohup` hosting. The systemd target was stopped and disabled, and `bash scripts/runtime/start-nohup.sh` started the backend on `127.0.0.1:8000` and frontend on `127.0.0.1:3000`, using the existing private environment files and working database. Gemini configuration is preserved. Output appends to `logs/backend.log` and `logs/frontend.log`; PID files are under the same ignored, private directory. Use `tail -f logs/backend.log logs/frontend.log` to follow output. These processes survive SSH disconnects, but do not automatically restart after failure or VM reboot. The owner subsequently configured public ingress for TCP 3000 and requested public frontend binding. The frontend now listens on `0.0.0.0:3000`, with intended URL `http://35.253.137.87:3000`; backend port 8000 stays loopback-only. This demo has development staff identities without sign-in and can modify stored data or make billable Gemini requests. Public HTTP browsers do not expose `crypto.randomUUID()`; browser workspace/request IDs use a shared secure `getRandomValues()` fallback so datasets, session recovery and operations work on this origin. The compatibility frontend build was produced with `npm run build -- --webpack`, with the previous build retained under ignored `artifacts/frontend-deployment/http-session-fix/previous-next`.

To return to systemd, stop the nohup backend with `kill "$(cat logs/backend.pid)"` and the frontend process group with `kill -- "-$(cat logs/frontend.pid)"`, then run `systemctl --user enable --now bankweave-private.target`. Do not start a second backend against the working SQLite store.

| Service                      | Runtime                                                                  | Listener         |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------- |
| `bankweave-frontend.service` | `npm run frontend:start` → Next standalone production server             | `127.0.0.1:3000` |
| `bankweave-backend.service`  | Python virtual environment → FastAPI/Uvicorn, one ASGI worker, no reload | `127.0.0.1:8000` |

The services have separate processes, logs, environment files and restart policies. Frontend startup waits for backend readiness; restarting the backend does not stop the frontend. Restarting the frontend does not touch the backend or banking store. The same-origin browser → Next gateway → FastAPI request boundary remains in place. Port separation itself is not a measured request-speed improvement; independent deployment/restart control is the verified improvement.

Unit templates live in `scripts/systemd/` and are installed under `~/.config/systemd/user/`. They assume the checkout is at `$HOME/BankWeaveAI`; adjust the paths for a different checkout. The enabled `bankweave-private.target` starts both services when the user's systemd manager starts. The child services are static units wanted by that target, so their `static` installation status is expected.

Private runtime configuration is separate from source:

- `~/.config/bankweave/frontend.env`: `HOSTNAME`, `PORT`, `RISKLENS_BACKEND_URL`, `RISKLENS_IDENTITY_ADAPTER`, `NEXT_TELEMETRY_DISABLED`.
- `~/.config/bankweave/backend.env`: persistent storage/library paths, backend port and backend identity/provider settings. Auto-seeding is disabled by the launcher. Backend credentials/grants belong here or in approved private credential stores, not frontend configuration.

Current settings retain local provider/development identity for the private demo. The Node production build and Uvicorn runtime do not establish verified public authentication; configure/test G05 before public ingress. Keep one worker for the current SQLite/checkpoint store until persistence/concurrency changes have been evaluated.

```bash
# Inspect the running pair
systemctl --user status bankweave-backend.service bankweave-frontend.service
# Restart just the interface
systemctl --user restart bankweave-frontend.service
# Restart just FastAPI
systemctl --user restart bankweave-backend.service
# Start/stop/restart the whole pair using the explicit target name
systemctl --user restart bankweave-private.target
# Inspect a component's logs
journalctl --user -u bankweave-backend.service
```

The independent npm commands are `npm run frontend:start` and `npm run backend:start` (the backend shell launcher is Linux/VM-specific). For manual use, export the corresponding runtime settings first; avoid launching duplicates of the managed services. `npm run dev` and the combined `npm start` remain local convenience launchers. Only frontend startup copies built public/static assets; it never migrates/seeds banking data. The backend validates the selected persistent store before executing Uvicorn. The port probe permits closed-connection reuse while still rejecting a live listener.

Acceptance on 12 October 2026: restarting each component preserved the other component's PID; backend health and proxied dashboard/customer responses recovered successfully; banking, conversation, form, report and approval row counts were unchanged. The first restart check exposed a closed-socket port-probe bug, which was corrected and the component restart check rerun successfully. No request-latency benchmark or actual VM reboot test was performed.

SQLite is the implemented local driver. Database and checkpoint paths are independently configurable; unsupported drivers fail explicitly. Managed SQL/checkpoint stores are not implemented or tested yet.

Include the `conversations` table introduced by migration `015_conversations`. Preserve its workspace foreign key, per-chat scope/message references and active-conversation state along with `session_artifacts`; test reopening two chats and a reviewed form after migration/redeployment.

Also preserve the submitted snapshots, request ownership, decisions and events in migration `017_admin_approvals`. Verify pending staff-request recovery, cross-tenant rejection, atomic approval and replay after migration. Keep application records and graph checkpoints as a matched set.

At G04 choose one managed relational store, implement its connection/transaction adapter and translate SQLite-specific JSON/date queries. Use a compatible durable LangGraph saver instead of container-local checkpoint files. Export every applied migration's canonical tables with `(dataset, id)` identities and integer monetary units: source records, profiles/form versions, sessions, artifacts/report files, cases/dispositions, policy library, detector runs, import previews/receipts, repayments, insurance, preferences/recommendation runs/reviews, cashflow, KYC cases, maintenance receipts/events and audits. Migrate graph checkpoints as a matched set. Import to a staging schema, reconcile source counts/hashes and recover a pending review before switching traffic. Keep BankShield's incomplete relationships visible.

Do not run the fixture seed over migrated source data. The seed intentionally replaces original banking fixture tables; generated product inserts and reviewed profile edits are preserved, but that is not an import/migration strategy. Back up local databases before any explicit reseed.

For rollback, stop writes, restore the application/checkpoint backups as a matched pair, point a private runtime back to the previous schema and verify that repeated confirmation cannot add a second customer. Do not apply destructive down-migrations to edited banking records. Backup recovery in the actual managed store remains a live G04 acceptance check.

## Verified staff identity — G05 preparation

`backend/core/iap_identity.py` implements opt-in signed IAP assertion verification. It remains disabled in the private demo. Configure the same adapter on frontend and backend only when the actual IAP ingress/audience and approved staff grants are ready:

```dotenv
RISKLENS_ENV=production
RISKLENS_IDENTITY_ADAPTER=iap
RISKLENS_IAP_AUDIENCE=<exact signed-header audience from the protected resource>
RISKLENS_STAFF_GRANTS_FILE=<absolute private path to staff.json>
```

The grants file is private server configuration, outside Git/images. Use verified IAP subject IDs and the corresponding emails, not browser headers. An example of its schema (fictional values, not an active grant):

```json
{
  "version": 1,
  "staff": [
    {
      "subject": "accounts.google.com:EXAMPLE_ONLY",
      "email": "staff@example.test",
      "role": "analyst",
      "tenant": "meridian-demo"
    }
  ]
}
```

Only Viewer/Analyst/Admin and the existing `meridian-demo` tenant are supported. An empty staff list denies everyone. Missing/malformed configuration, duplicate subjects, mismatched emails, unsigned headers, incorrect signatures/audiences/issuers/times and unsupported grants fail closed. Staff grant revocation is checked on each request. Google public keys are fetched from a fixed HTTPS endpoint with a five-second timeout and bounded cache; JWT errors returned to clients contain no credentials or claim details. [Google signed-header validation requirements](https://docs.cloud.google.com/iap/docs/signed-headers-howto).

Verified identities receive stable `iap-...` actor IDs and separate browser recovery keys. This intentionally gives no implicit access to legacy local actors' workspaces. Before migration cutover, implement and review an explicit authorized recovery mapping for the actual saved chats/forms/imports/reports; do not relabel historical actors or copy recovery handles into public notes. Multi-tenant banking records, account lifecycle/session revocation, live IAP ingress and deployed end-to-end permission/stream tests remain G05 work. Offline signature/API tests are not evidence that Google sign-in is live.

## Read-only G01 preflight

Run on this VM or from an authorized project-administrator environment:

```bash
python3 scripts/checks/gcp_preflight.py --project ai-builders-cup \
  --instance instance-20261012-050751 --zone us-central1-a
```

This reads enabled services, project metadata, billing linkage and VM configuration. It never enables an API, grants IAM, provisions resources or prints access tokens. The current VM credential returns insufficient OAuth scopes for all four checks. `cloudReadsComplete` means only that these inventory reads succeeded; `g01Complete` remains false until actual credits/expiry/eligible SKUs, budget filters/alerts, runtime IAM and model/location access are verified. A billing-enabled project is not evidence of available credits.

## Activation remains pending

G02 has a verified private-VM Gemini profile; see below. G01 full project/billing inventory; G03 container deployment; G04 managed durability; G05 verified staff identities; G06 private retained artifacts; G07 cloud telemetry/limits; G08 scheduled jobs; G09 verified data handling remain pending. Production currently fails closed for staff requests until identity integration is configured.

## Vertex activation on the private VM

The public analyst supports typed customer-ranking intents (transaction value/count or original loan principal), including spelling variants such as “find the big 5 our coustemers.” Rankings use fixed database queries and name their basis; Gemini never supplies SQL or chart values. Unsupported BankShield loan/device requests show clearly labelled available transaction evidence instead of the old generic local-analyst response. New workspace scope defaults to `period=all`; explicit month selections and existing chats retain their saved scope. All-month loan defaults count distinct loans, while repayment/insurance snapshots use the latest available month end. The compact UI offers dataset/month selectors, selectable banking analysis and OCR actions, and plain process labels without framework/provider implementation details.

Validation for this update: 41 feature/provider checks and 18 TypeScript checks passed; production webpack build/typecheck passed. Three isolated browser checks with the active Gemini profile passed for scope persistence, the original top-five question, and OCR selection/extraction. Working customer/account/transaction/loan/form/approval counts were preserved. Test logs are under ignored `logs/analyst-*.log`.

Owner-authorized live Gemini work on **13 October 2026** verified `gemini-3.5-flash-lite` in project `ai-builders-cup` using the `global` endpoint and the existing `google-genai==1.29.0` backend environment. No Gemini API key or downloadable service-account key is required. This endpoint choice does not establish a particular processing country; G09 remains open. [Google model documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite).

The independent backend reads its private user-service environment from `~/.config/bankweave/backend.env`:

```dotenv
RISKLENS_PROVIDER=vertex
RISKLENS_ENABLE_VERTEX=true
RISKLENS_GCP_PROJECT=ai-builders-cup
RISKLENS_GCP_LOCATION=global
RISKLENS_VERTEX_MODEL=gemini-3.5-flash-lite
RISKLENS_AUTO_SEED=false
```

After changing only these settings, restart `bankweave-backend.service`; the frontend gateway reads live backend responses. The accompanying provider-label UI change uses a separately staged production build: `/api/health` supplies the current provider, the composer/dataset status identifies Gemini or local mode, and each saved answer identifies its own provider/model. Promote the tested build with the previous `.next` retained for rollback, then restart only the frontend. Preserve both SQLite stores, banking IDs and saved work. Use `GET http://127.0.0.1:8000/health` or the same-origin `/api/health` to inspect provider/model/location and dataset readiness. Health does not itself make a model request.

The repeatable live API evaluator makes billable requests only when explicitly invoked:

```bash
backend/.venv/bin/python -m backend.evaluation.vertex --allow-live \
  --storage /home/harshilsangani07/bankweave-state/storage \
  --project ai-builders-cup --location global --model gemini-3.5-flash-lite
```

It uses SQLite's backup API to create a disposable application database and a separate QA checkpoint database. The first acceptance run passed **22/22** cases: source-parity fraud/loan KPIs and chart points, scoped follow-ups, general chat, historical/source coverage gaps, supplied policy citations, fictional PDF/image extraction, streaming/replay and Viewer denial before a model call. It used **33 model requests / 16,831 reported total tokens**, including 15,095 input and 1,736 output tokens. Working source counts were preserved. Reports stay under ignored `artifacts/evaluation/vertex-results.json`; scores describe this specific run rather than a guarantee about future requests.

For frontend acceptance, use the current production build with disposable loopback QA services:

```bash
backend/.venv/bin/python scripts/checks/verify_vertex_browser.py --allow-live \
  --storage /home/harshilsangani07/bankweave-state/storage \
  --project ai-builders-cup --location global --model gemini-3.5-flash-lite
```

This starts QA backend/frontend on ports 8100/3100, checks provider labels, real Gemini replies, SQL charts, regional follow-ups and restored chat history in Chromium, saves private screenshots/results under `artifacts/gemini-validation/`, then stops both QA services. Pass `--frontend-build <absolute staged .next directory>` to validate a staged build before promotion. The verifier uses the VM's installed `~/.config/bankweave/fontconfig.conf` when present; omitting it causes Chromium to crash on this minimal Debian setup. It never promotes QA chats/forms into working storage. The test is excluded from ordinary browser runs unless `RISKLENS_LIVE_VERTEX=true`.

Rollback uses the saved pre-activation environment under `~/bankweave-state/backups/`: restore that environment or explicitly select `RISKLENS_PROVIDER=local` and `RISKLENS_ENABLE_VERTEX=false`, then restart the backend. Revert provider source changes to the reviewed previous source if needed; do not restore/reseed banking databases merely to change the AI provider. The combined fallback launcher still selects local mode intentionally.

### Reviewed file imports in managed storage

Migration `016_structured_imports` adds `file_import_uploads`, `file_import_reviews` and `record_import_sources`. G04 must migrate their contents, ownership and immutable receipt references. G06/G09 must define retention/expiry/deletion for parsed staging rows, reviews and receipts: the original file bytes are discarded, but parsed information remains. G05 must replace development actors and define any cross-staff review handoff; local staged imports are scoped to their originating workspace/actor. Do not deploy an arbitrary SQL-file execution endpoint.

## Gemini and chart responses

Design checked 9 October 2026; exact-fact analytical narration and existing-series area/bar selection were implemented and live-tested on 13 October 2026. Model-generated code-execution chart images remain optional and inactive.

### Can Gemini return a chart?

Yes. Supported models can generate and execute Python, including Matplotlib graphs returned as inline bytes/images. Our application must read those image parts and render them in chat. A chart image is a static artifact, rather than our current interactive Recharts component. Google's cloud documentation lists graph output, a 30-second code-execution limit and token-based billing without a separate charge simply for enabling the tool. Confirm support for the exact model/location selected at deployment. [Google code execution documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tools/code-execution).

### Recommended approach for this product

Keep the existing interactive charts and rich answer blocks. No separate paid chart service is required. This recommendation is based on BankWeave's current Recharts/SQL architecture and the need for figures that reconcile with evidence.

1. Authenticate staff and enforce the requested dataset, tenant, customer and permissions on the backend.
2. Gemini proposes a bounded analytical request. Our approved read functions execute parameterized SQL and calculate the figures. Function calling returns a proposed tool name/arguments; our application performs the actual call. Never expose an unrestricted database connection, generated SQL execution or admin-write tools to the model. [Google function calling documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/tools/function-calling).
3. Give Gemini only the authorized, necessary aggregates and evidence references to explain the result. Use a constrained response schema for explanation and chart selection; validate the returned structure and references again in Python. Structured output helps constrain JSON shape, but does not prove a numerical claim. [Google structured output documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output).
4. The backend assembles `TEXT` → `KPI` → `CHART` → optional `TABLE`/`EVIDENCE` blocks. Chart points come from the same verified query result as the figures, with currency, period and scope attached. Gemini may choose an allowed chart kind/series reference; it must not invent or replace point values.
5. React renders the explanation and graph consecutively in the same answer. The Vertex adapter now provides database-grounded fraud/loan narration and chooses an allowed chart kind for existing trend/geography series. Exact source statements replace model-selected placeholders; unverified numerical prose, unknown facts, extra chart fields and repeated series references are rejected. Source KPI values and chart points remain unchanged and reconcile in offline/live acceptance checks.

Use code-execution chart images later for specialist export/one-off plots if useful. They are optional; do not run model-generated JavaScript or Python in our own banking backend to draw routine charts.

### Five-year credit coverage

First define **credit**: loan disbursements, outstanding loan balances at a date, or incoming account credits. These require different queries; balances must not be added together across successive snapshots.

The Meridian transaction fixture covers April–September 2026, and original transactions lack verified debit/credit direction. It cannot provide a five-year credit graph. The local analyst now states the coverage gap without making up points. A future historical dataset needs dated records for every requested year, metric/direction, amount in minor units, currency, branch/customer links, status, source references and completeness. Extend the historical dataset/import contracts as well as the analytical tool; current import periods are intentionally bounded.

### Credit eligibility

Use the Google-hosted Gemini/Vertex route and Cloud Run for the existing backend/frontend when deployment begins. Cloud Run provides pay-per-use execution and a free tier; a dedicated chart hosting service adds no value here. [Cloud Run pricing](https://cloud.google.com/run/pricing).

If the $300 balance is the standard Welcome credit, it expires within 90 days and applies to eligible Google Cloud usage. Google's current terms exclude Gemini API costs in AI Studio and partner-model managed APIs. Do not assume every Gemini endpoint uses the credit. Check the actual credit grant, billing project, eligible SKUs and model access before activation; this project has not inspected the user's billing balance. [Google Cloud Free Program](https://docs.cloud.google.com/free/docs/free-cloud-features).

Verified identity, managed persistence, billing controls and live Gemini evaluation remain the deployment roadmap prerequisites. No cloud resource was provisioned or credit spent during this research.

## Card campaign worker

The campaign release uses additive migrations 018–020 and fourteen new tables. Back up the application/checkpoint pair while writers are stopped, apply `npm run backend:migrate`, then explicitly generate the bounded campaign fixtures. Never run the original banking seed during this upgrade.

```bash
export RISKLENS_STORAGE_DIR="$HOME/bankweave-state/storage"
export RISKLENS_DB="$RISKLENS_STORAGE_DIR/risklens.sqlite3"
export RISKLENS_CHECKPOINT_DB="$RISKLENS_STORAGE_DIR/agent-checkpoints.sqlite3"
npm run campaigns:generate -- --cohort-size 5000 --seed 2026 --period 2026-10
npm run campaigns:worker
```

The generator reuses original Meridian IDs and recorded April–September values; the six additional campaign months and credit/holdings/consent observations remain explicitly synthetic and isolated from original ledgers. Its immutable batch and row hashes detect subsequent edits. Replaying the same unchanged generation reuses the batch. A future campaign month needs an explicitly published completed-source batch; schedules never invent new observations.

`scripts/runtime/campaign-supervisor.mjs` supervises the host-process worker, restarts an unexpected exit and forwards shutdown signals. The guarded `scripts/runtime/start-nohup.sh` starts backend, frontend and worker; inspect their PID files/logs before restart. User-service definitions are supplied under `scripts/systemd/`; do not start a second worker supervisor over an existing host-process deployment. The worker leases jobs with heartbeat/fencing, resumes checkpoints, and never seeds or migrates on startup. Its regular loop checks only opted-in schedules. The optional schedule timer is an alternative enqueue trigger; duplicate triggers resolve to the same run.

Default runs make at most one template call per selected demo product (maximum three), with optional up to twenty anonymous sample rewrites. Invalid output, unavailable providers or ungrounded claims fall back to labeled local templates. The canonical report contains call/token usage, sent-field metadata, exact source/catalog versions, reason/count reconciliation, and zero customer emails sent. Report publication and assigned inbox notifications commit atomically. Admin review binds the stored report hash and review revision; request changes opens a new campaign revision without rewriting the old report. Consent withdrawal is checked again before report publication and draft display. The release has no customer-delivery API.

Campaign endpoints are actor-scoped and intentionally ignore chat recovery handles. Live UI smoke checks should strip recovery headers and stub session restoration, preserving existing chats. Full write/approval/Research export acceptance belongs on isolated storage. Preserve old immutable reports and the legacy scenario renderer/API during future deployment migrations.
