# Deployment and operations

Use [README](../README.md) for a new local installation and [architecture](architecture.md) for the request and storage boundaries. Runtime credentials, working databases, browser recovery handles and backups stay outside Git.

## Judge access and public submission

The public demonstration is **https://35.253.137.87**. It uses a separate checkout under `~/bankweave-judge-app` and synthetic storage under `~/bankweave-state/judge-storage`. The original private app/store remain separate. The public role selector simulates staff identities; verified individual sign-in is pending. Real email delivery is disabled.

User services in `scripts/systemd/bankweave-judge*` supervise the public API, frontend and worker. The system gateway template is `scripts/systemd/bankweave-judge-gateway@.service`. `Caddyfile.judge` uses a short-lived Let's Encrypt IP certificate, requires `BANKWEAVE_JUDGE_HOST` and `BANKWEAVE_JUDGE_UPSTREAM`, redirects HTTP to HTTPS and blocks the test-email endpoint. Its private environment/configuration lives under `~/.config/bankweave/`. Certificate renewal requires the host to remain reachable. If the IP changes, update the gateway and published demo URL.

```bash
systemctl --user status bankweave-judge.target bankweave-judge-backend.service bankweave-judge-frontend.service bankweave-judge-worker.service
sudo systemctl status bankweave-judge-gateway@harshilsangani07.service
```

The owner has configured the VM tag/firewall for TCP 80/443. Future firewall changes require the owner's Compute administration access. Public visitors need no password or Google credentials. Keep the [reviewer guide](judge-demo-guide.md) consistent with the deployed configuration.

## Repeatable local setup

Use Node 24 and Python 3.11. Create a fresh virtual environment, install `npm ci` and `backend/requirements.lock.txt`, and copy `.env.example` to the root `.env`. For a new workspace, explicitly migrate, seed and generate campaign data as described in README. Normal startup never reseeds existing records.

The npm launchers load root environment files for frontend, API and worker processes. Direct Python commands need the same variables exported explicitly. Do not place credentials in `NEXT_PUBLIC_*` variables.

## Independent frontend and backend services

The private VM uses user-level systemd services grouped by `bankweave-private.target`:

| Service                             | Runtime                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `bankweave-frontend.service`        | Next standalone server, private port 3000.                    |
| `bankweave-backend.service`         | FastAPI/Uvicorn, one worker, private port 8000.               |
| `bankweave-campaign-worker.service` | Durable campaign job worker using the same application store. |

Templates live in `scripts/systemd/`; installed copies live under `~/.config/systemd/user/`. The private checkout is `$HOME/BankWeaveAI`. User lingering and the enabled target provide supervision beyond an SSH session. Avoid starting a second launcher or worker against the same ports/store.

```bash
systemctl --user status bankweave-private.target
systemctl --user restart bankweave-frontend.service
systemctl --user restart bankweave-backend.service
systemctl --user restart bankweave-private.target
journalctl --user -u bankweave-backend.service -u bankweave-campaign-worker.service
```

Private environment files are `~/.config/bankweave/frontend.env` and `backend.env`. They contain backend URL, storage paths and provider/identity settings. The public services use separate `judge-frontend.env` and `judge-backend.env` files. Host launchers use `BANKWEAVE_STORAGE_DIR` for the selected persistent directory and optionally `BANKWEAVE_LIBRARY_DIR` for locally installed OCR system libraries. Confirm the selected store before restarting.

The independent npm commands are `npm run frontend:start`, `npm run backend:start` and `npm run campaigns:worker`. `npm start` is the combined local convenience launcher. Building the frontend does not migrate or seed banking records. Promote a tested build with the previous build retained; restart only the components whose code changed.

## Backups, migration and recovery

The private store is `~/bankweave-state/storage`. The application and graph checkpoint files form a matched pair. Preserve `meridian.json`, the pinned BankShield cache and original customer IDs alongside them. Do not replace newer state with a synthetic seed or an older transfer.

Stop the complete app target, including its worker, before taking a matched backup. For a local foreground stack, use Ctrl+C. Use a new private backup directory:

```bash
mkdir -m 700 bankweave-backup
sqlite3 backend/storage/risklens.sqlite3 ".backup 'bankweave-backup/risklens.sqlite3'"
sqlite3 backend/storage/agent-checkpoints.sqlite3 ".backup 'bankweave-backup/agent-checkpoints.sqlite3'"
sqlite3 -readonly bankweave-backup/risklens.sqlite3 "PRAGMA integrity_check;"
sqlite3 -readonly bankweave-backup/agent-checkpoints.sqlite3 "PRAGMA integrity_check;"
```

Replace the default paths with the selected deployed store. SQLite's backup operation includes committed WAL data; copying only a live database file can omit it. Keep backups outside Git. Restore only while all writers are stopped and preserve the current store for rollback.

`npm run backend:migrate` applies pending SQL and verifies checksums in `schema_migrations`. Never edit an applied migration; add a new one. `024_form_sources` retains validated original PDF/image bytes, MIME and SHA-256 for owned downloads. Earlier missing uploads are not reconstructed automatically. Application records, graph checkpoints, original documents, forms, approvals, campaigns and immutable reports must survive upgrades together.

Read-only VM preflight:

```bash
backend/.venv/bin/python scripts/checks/verify_vm_state.py \
  --storage "$HOME/bankweave-state/storage"
```

It checks SQLite/schema integrity, migration/source/report hashes and original identities. Pending migrations must be reconciled deliberately before restarting the guarded host launcher. Preflight does not prove two separately captured databases represent the same instant or restore browser ownership handles.

## Private container demo

`frontend/Dockerfile` packages Next's standalone output. The backend image includes OCR libraries, runs migrations and uses an unprivileged user. `compose.yaml` binds frontend/API to loopback and includes a separate campaign worker sharing `/data`; the worker starts after API health and does not migrate or seed.

For a first-time container seed, export the fixture with `node --import tsx scripts/data/export-demo.ts`, copy `backend/storage/meridian.json` into the backend's `/data/meridian.json`, then explicitly run `python -m backend.features.datasets.demo_import` in that container. Generate campaign inputs separately. Never repeat fixture seeding over an existing store.

`compose.vm.yaml` replaces the named storage volume with a restored host directory for both API and worker. Set `BANKWEAVE_STORAGE_DIR` to that absolute path, verify UID 1001 has access, then inspect:

```bash
docker compose -f compose.yaml -f compose.vm.yaml config
```

Docker image execution and Cloud Run ingress/streaming remain unverified on this VM. The Compose stack is a private development-identity demonstration. A health response does not establish public authentication.

## Vertex activation on the private VM

The Vertex adapter uses Application Default Credentials (ADC), not an AI Studio API key. For your own project, enable Vertex AI, arrange billing and appropriate model-use permissions, then authenticate locally if needed:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Set the following in the private root `.env` or service environment:

```dotenv
RISKLENS_PROVIDER=vertex
RISKLENS_ENABLE_VERTEX=true
RISKLENS_GCP_PROJECT=YOUR_PROJECT_ID
RISKLENS_GCP_LOCATION=global
RISKLENS_VERTEX_MODEL=YOUR_AVAILABLE_GEMINI_MODEL
```

The tested hosted configuration uses `gemini-3.5-flash-lite` in project `ai-builders-cup` at `global`. Model availability and permission must be checked for a separate project. The `global` endpoint does not establish a processing country. Prefer an attached service account on Google Cloud over a downloadable key. Restart the backend after changing its environment, and inspect `/health`, `/api/health` or Settings. Health checks make no model call.

### Gemini and chart responses

Database tools compute KPI, table and chart values. Gemini may choose an existing allowed series or chart type and explain verified facts; it does not supply SQL, invent chart values or approve banking actions. Research exports carry the saved result's actual model/tool receipts and disclose local/fallback output. No model-generated code execution is needed for routine charts.

## Verified staff identity — G05 preparation

The opt-in IAP adapter validates signed assertions, audience/issuer/time, approved roles and server-side staff grants. Default demo identities are rejected in production. Before public production access, configure protected ingress and verified staff grants, then test revocation, session ownership and authorized recovery of legacy workspaces.

```dotenv
RISKLENS_ENV=production
RISKLENS_IDENTITY_ADAPTER=iap
RISKLENS_IAP_AUDIENCE=YOUR_PROTECTED_RESOURCE_AUDIENCE
RISKLENS_STAFF_GRANTS_FILE=/absolute/private/staff-grants.json
```

Use approved subject IDs and server-side grant files; browser headers cannot establish staff identity. Legacy local workspaces receive no implicit access mapping. The adapter exists but is not active in the public synthetic demo. Multi-tenant isolation beyond the implemented bank tenant remains future work.

## Campaign test email configuration

Matching, drafts, report review and exports work with delivery disabled. Optional test sending requires `BANKWEAVE_EMAIL_ENABLED=true`, private `SMTP_USERNAME`, `SMTP_FROM`, `SMTP_PASSWORD` and fixed `BANKWEAVE_EMAIL_TEST_RECIPIENT` settings. Use the configured SMTP app password where required. Delivery remains Admin-only, reviewed, consent-checked, idempotent and rate-limited. SMTP acceptance is not proof of inbox delivery. Keep delivery disabled in the public demo.

## Card campaign worker

`npm run campaigns:generate` creates bounded campaign-only observations from original Meridian identities; it never reseeds banking tables. Immutable batch/row hashes detect subsequent edits. An unchanged replay reuses the batch. A new campaign month needs an explicitly published completed-source batch.

`npm run campaigns:worker` supervises the host worker. Jobs use leases, heartbeat/fencing and checkpoint recovery. Schedules are opt-in; duplicate triggers resolve to the same run. Do not start a second worker supervisor over an existing deployment. Default drafting is bounded, discloses actual model usage and falls back to labelled local templates when needed. Report publication and assigned notifications commit together; later revisions do not rewrite old reports. Consent is checked again before publication/display.

## Validation and safe upgrades

Run the README validation commands on disposable storage. Browser checks write data, so use copied application/checkpoint files, local AI, disabled SMTP and separate ports. Useful additional checks are:

```bash
node scripts/runtime/python.mjs scripts/checks/verify_customer_integrity.py
node scripts/runtime/python.mjs scripts/checks/verify_recovery.py
```

Opt-in Vertex evaluation makes billable requests and copies the selected application store:

```bash
backend/.venv/bin/python -m backend.evaluation.vertex --allow-live \
  --storage "$HOME/bankweave-state/storage" \
  --project YOUR_PROJECT_ID --location global --model YOUR_AVAILABLE_GEMINI_MODEL
```

`scripts/checks/verify_vertex_browser.py --help` documents isolated live browser acceptance. These checks do not promote QA state. Keep source/build backups and matched state backups before upgrading; verify protected record counts, IDs and immutable report hashes afterward. Roll back a failed build without reseeding financial data.

`npm run check:secrets` inspects publishable current files, not all Git history. Scan history separately before publication. Credentials belong in private host configuration or a secret manager. GitHub Actions secrets do not automatically configure a cloned app or this VM. The remaining production requirements are listed in [the roadmap](roadmap.md#remaining-production-work).
