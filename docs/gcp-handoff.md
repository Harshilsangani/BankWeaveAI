# BankWeave AI — complete GCP agent handoff

Prepared **12 October 2026** from the current Windows working tree and a fresh read-only database check. This file is the entry point for the agent moving BankWeave to GCP. Read the linked repository files before implementation. Recheck Git status, data counts, installed versions and cloud configuration when work resumes; this is a dated baseline, not a live status feed.

**Scope of this handoff:** preserve the current product, move the latest source and existing state to the selected VM, validate it privately, implement verified authentication and then activate/evaluate Gemini through Vertex AI. This document was initially prepared without cloud actions. The user subsequently authorized publishing the latest source to GitHub on 12 October 2026; use the `main` revision containing this handoff and current feature files. No VM creation, cloud project selection, state transfer or Gemini activation is completed by that source push.

**13 October update:** the owner authorized Gemini activation after a successful VM request. The private VM profile now uses `gemini-3.5-flash-lite` / `global` in `ai-builders-cup`, with live API acceptance at 22/22. Typed contextual routing and exact-fact analytical narration/chart selection were added; SQL still supplies every KPI/chart value. See the newer [Vertex runtime and acceptance instructions](deployment.md#vertex-activation-on-the-private-vm) and [roadmap](roadmap.md). The original pending items below are the earlier migration baseline; full G01/G03–G09 acceptance remains separate.

## 1. Read these files in order

| Order | File                                                                               | Why it matters                                                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [AGENTS.md](../AGENTS.md)                                                          | Repository rules: preserve state, do not reseed or edit applied migrations; read installed Next.js guides before coding.                                        |
| 2     | [README.md](../README.md)                                                          | Product, local setup, supported features, roles, data boundaries and validation commands. Its seed commands are for a new database, not a transferred database. |
| 3     | [Architecture](architecture.md)                                                    | Agents, request boundaries, ownership, persistence, approval workflow and API groups.                                                                           |
| 4     | [Roadmap](roadmap.md)                                                              | Implemented local work and G01–G09 cloud tasks still pending.                                                                                                   |
| 5     | [Deployment](deployment.md)                                                        | Existing containers, storage migration requirements, Gemini/chart design and credit constraints.                                                                |
| 6     | [Import guide](imports.md)                                                         | Exact supported CSV/Excel schemas, worksheet order, limits and approval semantics.                                                                              |
| 7     | [Data sources](data-sources.md) and [BankShield audit](data/bankshield-audit.json) | Dataset provenance, currency/date coverage, incomplete joins and source restrictions.                                                                           |

Also inspect `.env.example`, `.gitignore`, `.dockerignore`, `compose.yaml`, both frontend/Dockerfiles, `package.json` and the Python requirement files. After `npm ci`, read the relevant installed guides under `node_modules/next/dist/docs/` before changing Next.js code; do not assume conventions from another Next.js version.

Old root planning/completion files were consolidated into `docs/` and removed. Do not recreate a separate status log for each task. Update this handoff, the roadmap and durable reference documents as appropriate.

### Receiving VM update — 12 October 2026

The source baseline `06a184e` is now checked out on GCP VM `instance-20261012-050751` in project `ai-builders-cup`, `us-central1-a`. Metadata reports `e2-standard-4`; the OS is Debian 13. This is the actual existing VM, rather than the Mumbai/Ubuntu target described below. Node 24/Python 3.11, locked dependencies and user-local OCR/browser prerequisites are installed. The owner subsequently chose **fresh synthetic banking data** on 12 October 2026. The private working store at `/home/harshilsangani07/bankweave-state/storage` now contains the clean canonical fixture/source data, application database and checkpoint store; no Windows saved chats or added profiles were transferred. Preserve this working state rather than overwriting it if Windows backups arrive later.

VM-local build/typecheck, 17 TypeScript checks, 69 backend checks (including eight offline signed-IAP/API checks), 12/12 local evaluation cases, three-process recovery and all 49 browser flows pass against isolated QA storage. Browser specs received fresh database copies, and identity-discovery mocks are not live IAP acceptance. The API audit corrected dataset/period forwarding, HTTP error/status handling, uncertain retry idempotency and blocked-storage recovery. These fixes are deployed; live scope/status checks pass with the backend process and stored banking/chat/form/report/approval counts preserved. Previous frontend output is retained under ignored `artifacts/frontend-deployment/api-audit-20261012/`; QA servers are stopped. Windows-state acceptance is deferred by the fresh-start choice. The [roadmap](roadmap.md#current-gcp-vm-preparation--12-october-2026) records current blockers. Restricted service-account scopes prevent cloud API/billing inspection; passwordless sudo/Docker daemon access is unavailable. No live Gemini activation or public exposure has occurred.

The fresh working dataset passed read-only SQLite, schema, original-ID, product-join and source-cache checks: 10,000 Meridian customers/accounts, 8,000 loans and 120,000 transactions; fraud flags remain 833 → 1,091. An initial matched-state backup is retained at `/home/harshilsangani07/bankweave-state/backups/fresh-initial-20261012`. The application now runs as independent user-level `bankweave-frontend.service` (npm/Next production build) and `bankweave-backend.service` (FastAPI/Uvicorn), grouped by the enabled `bankweave-private.target`, with user lingering enabled and loopback ports 3000/8000. The original combined service is disabled and retained for rollback. Independent component restarts preserve the other component's process, stored counts and successful proxied directory/dashboard responses. See [service configuration](deployment.md#independent-frontend-and-backend-services). Actual VM reboot recovery has not been exercised. This is a fresh private demo, not completion of managed persistence, public identity or Gemini activation.

`compose.vm.yaml` now supplies the bind-mount override that section 8 previously described as missing. `scripts/checks/verify_vm_state.py` performs read-only restore checks, and `scripts/runtime/start-private-vm.sh` supports private host-process startup while Docker administration is unavailable. See [current startup instructions](deployment.md#private-vm-restore-and-host-startup). Existing fixture bytes are preserved by startup/export; all QA seeding stays separate from the receiving directory.

## 2. Product goal and non-goals

**BankWeave AI — Banking Intelligence & Operations.** The goal is an analytical workspace for banking staff: understand connected records, investigate risk, inspect evidence and carry out reviewed data operations.

The current interface uses Google-inspired light styling and neutral dark styling, with an AI Analyst chat/composer, inline analytical blocks, saved conversations, and a standalone Data Workspace opened from Command Center. New chat belongs below the Analyst navigation; Knowledge Library is a labeled sidebar resource. Attachments and dataset selection live in the composer's + menu. Tools offers removable OCR and Research selections. Relative reporting windows are requested in chat; Risk Radar keeps its own dataset/month controls. Settings displays the actual AI provider/model. Investigations has an owned case inbox and separate Overview, Evidence & links, Review and Activity views. Card Campaigns replaces the visible Scenario Simulator while legacy saved comparisons/reports stay readable.

The 13 October screenshot review tightened the shared card/control spacing, kept navigation visible while scrolling, aligned the Analyst conversation and composer, made Tools dismissible with Escape/outside click, and improved tablet KPI/charts and mobile data tabs. Investigation metrics/charts precede the case form. Settings reads the actual AI provider/model from health rather than showing a fixed local-provider label. Final screenshots cover all nine pages in Chromium at 1440, 768, 390 and 320 pixels, with light and dark mobile/desktop checks; the generated gallery is `artifacts/frontend-deployment/ui-review-20261013/index.html`. See the roadmap for the current deployed build and validation.

Maintain these two main demonstration paths:

1. Banking question → scoped database analysis → text/KPIs/charts/tables → investigation → evidence/relationship map → staff review → immutable report.
2. Filled form upload → inline Markdown extraction → editable customer fields → staff submission → locked approval request → explicit admin approval/rejection → pending-verification customer and linked KYC review case.

The product does not execute real payments, open bank accounts, approve KYC, make lending decisions or establish regulatory compliance. Exposure is flagged value/principal under review, not confirmed loss. Preserve these distinctions in UI and model replies.

## 3. Source of truth and Git status

| Item                          | Baseline                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current source workspace      | `C:\Users\HARSHIL\Documents\ChatGPT\singapore`                                                                                                           |
| Repository                    | `https://github.com/Harshilsangani/BankWeaveAI.git`                                                                                                      |
| Local branch                  | `main`                                                                                                                                                   |
| Initial upload for comparison | `21977952e253a2c244899f2042bd2e4387dc803d` — `first commit`                                                                                              |
| Latest product work           | The source update containing this handoff includes the latest feature files and cleanup. Verify its exact Git revision and any subsequent local changes. |
| Current persisted state       | Ignored files under `backend/storage/`, not GitHub.                                                                                                      |

**Use the latest `origin/main`, not the initial upload.** On an existing clean checkout, fetch and fast-forward to the current branch; preserve any local VM edits instead of resetting them. Verify this file and the current approval/role files exist. `git archive HEAD` contains only committed source, not later local edits or runtime databases. A successful source push does not transfer saved customers, chats or checkpoints.

There are two separate transfers:

- **Source transfer:** all tracked source changes, intended deletions and required untracked files, including this handoff. Include `frontend/` source/public/config/tests, `backend/` source/migrations/evaluation/tests, `demo/`, `scripts/`, `docs/`, the root npm workspace lockfile, and root configuration/instruction files.
- **State transfer:** consistent application/checkpoint database backups plus the matching fixture/source cache, sent privately outside Git and container images.

Do not transfer Windows virtual environments, `node_modules/`, `.next/`, `.git/` as an installation method, npm caches, old screenshots/test databases, local tooling databases, credentials or secrets. Reinstall dependencies/build on Linux. `.env.example` is a template, not a credential file.

The cleanup recovery archive is outside the repo at `C:\Users\HARSHIL\Documents\ChatGPT\BankWeaveAI-cleanup-backup-20261009`. It contains older notes and test artifacts and is **not** the deployment source or current production data. Do not upload that archive wholesale.

## 4. Current architecture and important code

| Layer                 | Files / responsibility                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend              | Next.js/React/TypeScript/Tailwind, Radix dialogs, Lucide, ECharts; `frontend/src/app/page.tsx`, `frontend/src/shared/`, `frontend/src/features/`, `frontend/src/shared/styles/theme.css`, `frontend/src/app/globals.css`.               |
| Workspace lifecycle   | `frontend/src/features/workspace/hooks/use-workspace.ts`, `frontend/src/features/analyst/components/chat-history.tsx`: scope, saved chats, active requests, cancellation and restoration.                                               |
| Service boundary      | Section `api.ts` and types, `frontend/src/shared/api/operations.ts`; same-origin gateways in `frontend/src/app/api/`; server-only upstream in `frontend/src/shared/api/server.ts`.                                                      |
| API and authorization | `backend/app.py`, `backend/core/security.py`, `backend/features/workspaces/sessions.py`, `backend/features/workspaces/conversations.py`.                                                                                                |
| Agents/providers      | `backend/workflows/analyst.py`, `backend/integrations/ai/__init__.py`, `backend/features/knowledge/service.py`, `backend/features/forms/service.py`.                                                                                    |
| Analytics             | `backend/features/analytics/queries.py`, `backend/features/products/`, `dashboard/`, `risk/` and `investigations/`.                                                                                                                     |
| Admin onboarding      | `backend/features/forms/approvals.py`, `backend/features/forms/quality.py`, `backend/features/customers/kyc.py`; `frontend/src/features/forms/components/form-review.tsx`, `frontend/src/features/forms/components/approval-queue.tsx`. |
| Records/imports       | `backend/features/customers/records.py`, `backend/features/imports/service.py`, `backend/features/customers/quality.py`, `backend/features/customers/maintenance.py`; import wizard in the Data Workspace.                              |
| Storage/exports       | `backend/core/database.py`, `backend/migrations/`, `backend/features/reports/html.py`, `backend/workflows/operations.py`.                                                                                                               |
| Fixtures/checks       | `demo/banking-data.ts`, `frontend/tests/fixtures/`, `backend/tests/`, `frontend/tests/e2e/`, `backend/evaluation/cases/questions.json`.                                                                                                 |

Application routes use FastAPI consistently. Historical mock analytics/report helpers are now test fixtures only. Do not restore a production mock fallback for reports, scenarios or permission failures. Reports are generated from the canonical stored investigation, not client-supplied findings.

Backend packaging targets Python 3.11; frontend packaging uses Node 24. Use `package-lock.json` and `backend/requirements.lock.txt` for reproducible installation. Direct Python dependencies remain separately listed in `backend/requirements.txt`; the old duplicate Vertex requirements file was removed because the SDK is already installed by the main requirements.

## 5. Features already implemented locally

| Feature                     | Current behavior / material limit                                                                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command Center / Risk Radar | SQL-backed historical metrics and versioned detector snapshots. Manual runs, recorded source lineage and risk dispositions; no live/scheduled feed.                                            |
| AI Analyst                  | Database fraud/loan/product answers, rich inline response blocks, context follow-ups, evidence and safe operational progress. Local general chat/routing is scripted.                          |
| Greetings / history         | Hi/Hello/Good morning/Namaste use general chat; role-aware welcome/profile labels. Separate conversations restore rich answers, selected scope and canonical form state.                       |
| Investigations              | Saved cases, assignment/notes/status/events, bounded source-linked maps. Correlation is not proof of collusion.                                                                                |
| Scenarios                   | Assumption-based stronger-authentication model for supported Meridian fraud signals. Loan scenarios are unsupported.                                                                           |
| Reports                     | Canonical immutable HTML, content hashes, scoped download and access audit. Existing exports must not be rewritten from new source facts.                                                      |
| Customer directory          | Shared identities and linked products, admin CRUD, stale-record checks and linked-product deletion guards.                                                                                     |
| CSV/Excel imports           | Mapping, worksheet selection, validation/error downloads, owned reviews, provenance and replay-safe atomic appends. Each sheet is confirmed separately by Admin. No executable `.sql` imports. |
| OCR                         | Printed English PDF/PNG/JPEG extraction, inline Markdown, copy/download, editable fields and provenance. Handwriting/regional-language quality remains unevaluated.                            |
| Admin approvals             | Locked hashed snapshot, current duplicate checks, explicit decision/note, atomic decision/customer/audit, replay safety and rejection with no customer creation.                               |
| KYC reviews                 | Missing references, notes and event history; Admin can review the case from a same-tenant submitted form. Neither extraction nor review verifies identity.                                     |
| Customer products           | Synthetic repayments/installments, insurance, declared needs/recommendations and labelled cashflow observations. No actual product execution.                                                  |
| Knowledge                   | Versioned Markdown/plain-text documents, lexical retrieval and checked supplied-section citations. Seed policies are fictional.                                                                |
| Packaging                   | Checked migrations, locked dependencies, health checks, standalone frontend and private Compose definitions. Linux/container acceptance still pending.                                         |

The working database currently has **zero admin approval requests and zero staged file imports**, because write tests were run on isolated copies. This is not a missing feature. Create fictional acceptance requests only in a test copy, then verify the deployed flow deliberately.

## 6. Roles, ownership and security requirements

There are exactly **three canonical/selectable roles**:

| Role    | Capability                                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| Viewer  | Browse records and available results; no analysis/upload/write actions.                                             |
| Analyst | Analyse/investigate, extract/correct forms, submit admin requests and record permitted analytical discussion notes. |
| Admin   | Analyst capabilities plus approval decisions and active banking record maintenance.                                 |

Only Admin changes customer records, uploads/previews/applies banking imports, publishes shared policy documents, maintains account/policy/payment observations, changes customer declarations or updates KYC reviews. Analyst cannot bypass approval by calling a write endpoint or agent node directly. The graph's customer node reflects an already-approved result; only the admin endpoint commits a customer write.

The old `customer_operator` input is an **Analyst compatibility alias**, preserving original actor `local-customer_operator` and its workspace. Do not rename stored owners or erase sessions to simplify naming. Preserve historical audit attribution and artifact provenance.

**Verified production authentication is not configured/deployed.** An opt-in signed-IAP adapter is now implemented and covered by offline signature/API checks; see [current configuration and remaining G05 work](deployment.md#verified-staff-identity--g05-preparation). Current Settings role switching and `x-risklens-role` headers are development simulation. `backend/core/security.py` rejects development identities when `RISKLENS_ENV=production`; a healthy production backend can therefore still reject every staff request. This fail-closed behavior is intentional. The IAP adapter assigns new verified actor IDs and does not implicitly grant legacy local workspaces; actual authorized recovery mapping remains required before cutover.

For public deployment, configure and validate the selected verified identity adapter and a protected frontend-to-backend identity path. Verify signatures, issuer/audience/expiry, role and tenant grants server-side. Do not trust browser role/actor headers, expose the backend publicly or turn off production checks to make the demo work. Map verified users to authorized existing workspaces without changing immutable historical actor facts. Cover form requests, KYC handoff, import ownership, case/report access, replay and cross-tenant rejection in tests.

## 7. State that must be preserved

Default local storage is `backend/storage/`:

| File                           | Contents / requirement                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `risklens.sqlite3`             | Canonical banking records, profiles, drafts/versions, conversations/workspaces, artifacts, reports, cases, policies, detector snapshots, import/maintenance receipts and audit history. |
| `agent-checkpoints.sqlite3`    | LangGraph checkpoints, including paused form reviews. Transfer with the application DB as a consistent pair.                                                                            |
| `meridian.json`                | Matching original synthetic fixture; the integrity verifier uses its IDs/hash. Do not replace it by regenerating a different fixture.                                                   |
| `bankshield/`                  | Revision-pinned source cache/provenance where present. Inspect recursively; keep the matching source assets rather than inventing relationships.                                        |
| `*-wal`, `*-shm` while running | SQLite runtime sidecars. A live copy of just the main file can miss committed WAL changes. Use SQLite backups after quiescing writes.                                                   |

Environment seams: `RISKLENS_STORAGE_DIR`, `RISKLENS_DB` and `RISKLENS_CHECKPOINT_DB`. Do not accidentally point at empty paths and seed another dataset. `backend/storage/` is ignored by Git and excluded from Docker images; a clone/image does not contain the working state.

**Read-only baseline verified 12 October 2026:**

| Record group                                 |           Count |
| -------------------------------------------- | --------------: |
| Current Meridian customers/profiles          |          10,021 |
| Original customer master identities          |          10,000 |
| Accounts                                     |          10,000 |
| Loans                                        |           8,000 |
| Transactions                                 |         120,000 |
| Installments / payments                      | 48,000 / 47,235 |
| Insurance / cashflow observations            | 6,666 / 180,000 |
| Workspaces / conversations                   |       314 / 148 |
| Saved artifacts / form drafts / report files |   384 / 28 / 21 |
| Recorded operations                          |             173 |

Latest applied schema: **`017_admin_approvals`**. The verifier found zero missing original IDs, missing checked parents, branch/device mismatches or overpaid principal. Original fixture SHA-256: `aedfcc78883d6dea8bae44ada761e6fa8bd34a48bd1ce5f01fdc164af55a1f48`. Original customer-ID hash: `c6dfd17f1c97270217364156860c941a8acbb2ca691f6a8be822ccdb5f84f10e`.

Rerun the verifier immediately before backup and after restore. Counts may legitimately increase after this handoff; reconcile against the actual cutover snapshot, not by deleting records to match this table. Source periods/currency and BankShield's incomplete joins must remain unchanged.

## 8. Safe transfer sequence

### A. Package the latest source

1. On Windows, inspect `git status --short`, branch and revision. Review intended deletions/untracked files as well as modified files.
2. Choose either a reviewed current Git commit/push, or an export of the complete working source tree with exclusions. Do not silently ship the initial HEAD or only tracked HEAD files.
3. Keep the source package separate from data/secrets. Include lockfiles, all applied migrations, demo templates, docs and current tests; exclude the generated/runtime directories listed above.
4. Record the source revision or package manifest/hash. On the VM, verify the expected new files exist: `backend/features/forms/approvals.py`, `backend/migrations/017_admin_approvals.sql`, `frontend/src/app/api/approvals/route.ts`, `frontend/src/features/forms/components/approval-queue.tsx`, `frontend/src/shared/lib/staff-role.ts`, `frontend/tests/fixtures/` and this handoff.

### B. Create a consistent data backup

1. Preserve the current local application. Enter a maintenance window, prevent new staff requests, let active jobs finish and stop the owned frontend/backend processes before taking the final pair of backups. Do not stop unrelated processes by name.
2. Back up **both** application and checkpoint DBs with SQLite's backup API to a new private transfer directory outside the repo. It incorporates committed WAL state. Do not copy only the main files while requests/checkpoint writes continue.
3. Copy the matching fixture and source cache. Record file sizes, SHA-256 hashes, schema/checksums and integrity/state counts. Retain the original local data and this backup as rollback copies.

Example backup logic, to run **only after the maintenance step**, from the source repo with Python. Replace the destination deliberately; verify it does not already exist. If storage paths were customized, use those actual paths instead of the defaults:

```python
from pathlib import Path
import sqlite3

source = Path("backend/storage").resolve()
destination = Path(r"C:\Users\HARSHIL\Documents\ChatGPT\BankWeave-transfer-state")
destination.mkdir(parents=True, exist_ok=False)

for filename in ("risklens.sqlite3", "agent-checkpoints.sqlite3"):
    path = source / filename
    if not path.is_file():
        raise FileNotFoundError(path)
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(destination / filename) as backup:
            original.backup(backup)
            assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
```

This example does not copy the fixture/cache or create a transfer manifest; complete those steps separately. Do not restore/export raw customer content into Git, chat messages or public storage.

### C. Transfer privately and restore without seeding

1. Transfer source and state through authenticated SSH/SCP or equivalent approved private transport. Verify package hashes on the VM.
2. Use a deliberate application path such as `/opt/bankweave` and durable data path such as `/srv/bankweave/storage` on Persistent Disk. Keep state outside the source/image build directory.
3. Restore the DB pair and matching fixture/cache **before** normal application startup. Do not overwrite an existing VM database unless it has a verified backup and this replacement is authorized.
4. Set explicit storage/checkpoint paths and `RISKLENS_AUTO_SEED=false`. Apply migrations only. **Do not run `npm run backend:seed` or `python -m backend.features.datasets.demo_import` over restored data.** Migration checksums must match; fix the source/revision mismatch rather than editing an applied migration or deleting schema history.
5. Set ownership so the backend container UID 1001 can access the data directory. Protect access and backup credentials. Test integrity and restored state before switching users.

### D. Bring up a private single-VM demonstration

The agreed sizing is `e2-standard-4` (4 vCPU/16 GB), Ubuntu 24.04 LTS, Standard provisioning and 50 GB Balanced Persistent Disk, with Mumbai (`asia-south1`) preferred. This is a sizing target, not evidence that a VM exists. Project/VM name/zone/IP and credentials were not supplied for this handoff.

Use the existing frontend/Dockerfiles for Node 24 and Python 3.11 rather than copying Windows dependencies. Build/test Linux OCR and dependencies on the VM. `compose.yaml` is explicitly a **private development demo**: loopback ports 3000/8000, local provider and development identity. Access it over an SSH tunnel while production authentication is being implemented; do not expose this configuration publicly.

The existing Compose data target is `/data`. For a VM with restored files at `/srv/bankweave/storage`, add a reviewed override that replaces the backend volume at that target with a host bind mount. Example fragment:

```yaml
services:
  backend:
    volumes:
      - /srv/bankweave/storage:/data
    environment:
      RISKLENS_STORAGE_DIR: /data
      RISKLENS_DB: /data/risklens.sqlite3
      RISKLENS_CHECKPOINT_DB: /data/agent-checkpoints.sqlite3
      RISKLENS_AUTO_SEED: "false"
```

The override is now provided by `compose.vm.yaml`; set `BANKWEAVE_STORAGE_DIR` to the actual restored absolute path. Resolve it with `docker compose -f compose.yaml -f compose.vm.yaml config` and verify the actual mount/environment before startup. Build and start the reviewed combination; inspect logs and `/health`. Keep the backend loopback/internal. Use TLS and a protected reverse proxy only after verified identity is ready. Maintain a rollback route to the local instance.

A single VM with SQLite on durable disk can be an interim private demo. It is not the managed-database adapter or a highly available bank deployment. Do not launch multiple independent SQLite writers/replicas or scale workers blindly. For Cloud Run later, implement managed application/checkpoint persistence before moving state off the VM.

## 9. Saved chats and the change of URL

Copying the database preserves saved chats but **does not automatically transfer browser storage to a different origin**. Existing recovery IDs, selected role and per-tab selection live in browser localStorage/sessionStorage.

Important keys include `risklens-session-v1`, role-specific `risklens-session-v1-analyst/admin/viewer`, `risklens-role`, `risklens-workspace-v1`, `bankweave-analyst-identity-v1` and per-session `risklens-chat-v1-...` tab selections. These keys are compatibility/recovery handles, not authentication.

When moving from `http://127.0.0.1:3000` to a VM hostname, a fresh browser session can show no history even if every conversation is in the DB. Plan an authorized recovery/verified-user workspace mapping. Do not solve this by exposing all staff conversations or removing owner checks. If a private SSH tunnel intentionally uses the same original local origin, its browser storage can remain available; verify this rather than assuming a different port/hostname is equivalent. Keep recovery IDs out of shared notes.

Real authentication changes also need an explicit mapping from legacy local actors to verified staff. Preserve immutable historical actor attribution and authorize each workspace/receipt/import/form/case relationship; do not globally relabel every record to the admin account.

## 10. Gemini activation and charts

The future path remains **frontend → FastAPI/LangGraph → Gemini on Vertex AI plus approved SQL tools → durable storage**. Gemini does not need a model/GPU installed on the VM.

Actual backend variables, from `.env.example` and `backend/integrations/ai/__init__.py`:

```dotenv
RISKLENS_PROVIDER=local
RISKLENS_ENABLE_VERTEX=false
RISKLENS_AUTO_SEED=false
RISKLENS_DATABASE_DRIVER=sqlite
RISKLENS_GCP_PROJECT=
RISKLENS_GCP_LOCATION=
RISKLENS_VERTEX_MODEL=
```

After project/model/location, verified identity, access and data-handling checks are ready, set `RISKLENS_PROVIDER=vertex` and **`RISKLENS_ENABLE_VERTEX=true`**, with the actual project/location/model values. The flag is `ENABLE_VERTEX`, not `VERTEX_ENABLED`. Use approved runtime credentials/ADC, preferably a scoped VM workload/service identity; verify the container can acquire credentials. Never embed keys in frontend variables, Git or this document.

Current Vertex contracts support routing, general chat, grounded policy replies and form extraction. **Database analytics currently call SQL and format local answers; turning on Vertex does not automatically add Gemini narration/chart planning to every database response.** Implement that bounded extension under G02 and evaluate it separately.

Recommended analytical response design:

1. Backend authorizes scope and computes aggregates/series from validated read tools.
2. Gemini explains only the supplied facts and selects an allowed chart/series reference using a typed response contract.
3. Backend validates schema, references, units/period and coverage, then assembles existing TEXT/KPI/CHART/TABLE/EVIDENCE blocks.
4. Recharts renders the graph below the explanation in the same chat answer. Model output cannot invent or replace the point values, execute arbitrary SQL or approve writes.

Compatible Gemini models can also return static Matplotlib graph images through code execution; that is optional and not integrated here. See the official sources already recorded in [deployment](deployment.md#gemini-and-chart-responses).

For “past five years total credit,” first define credit as disbursements, outstanding balances or incoming account credits. The current data/import/tool coverage cannot produce that series. The analyst now explains the gap instead of inventing a graph. Add real historical coverage/contracts before marking this feature complete.

A Mumbai VM does not determine Gemini processing location. Verify the selected model/endpoint's actual regional commitments, retention/data-use terms and logging. Do not claim zero retention, verified KYC or unrestricted safe database access merely because Vertex is selected. If the $300 balance is standard Welcome credit, verify its expiry/SKU eligibility; the documented AI Studio API exclusion matters. No billing balance has been inspected.

## 11. Remaining cloud work and order

| Task                              | Deliverable / acceptance                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G01 — project, access and budgets | Obtain actual project/VM details, verify credits/APIs/workload permissions and cost limits.                                                              |
| VM transfer/private validation    | Ship latest source plus consistent state, mount durable disk, build Linux images and validate privately. This task is not yet done.                      |
| G05 — verified identity           | Replace demo identity, map existing workspaces, secure the gateway and test roles/tenant/artifact access before public exposure.                         |
| G02 — live Gemini                 | Activate selected provider; test route selection, general replies, OCR, policy grounding and new analytical narration/chart contracts.                   |
| G04 — managed persistence         | Implement the database/checkpoint adapters and migrate/reconcile state before managed scaling/Cloud Run. Persistent VM SQLite is only an interim option. |
| G03 — public deployment           | Validate containers, TLS/ingress, streaming/timeouts, frontend-to-backend access and deployed acceptance flows.                                          |
| G07 — observability/cost          | Bounded requests/tokens/pages/retries, quotas/budgets, latency/error monitoring and redacted logs.                                                       |
| G09 — data handling               | Verify processing location, terms/configuration, retained staging/PII, expiry/deletion and audit behavior.                                               |
| G06 — private artifacts           | Add intentionally retained originals/report storage with access/expiry/deletion if promised.                                                             |
| G08 — scheduled jobs              | Idempotent ingestion/detection and freshness indicators; retain snapshot labels until real jobs run.                                                     |

Do not mark a cloud task complete from a local build, a healthy VM, a fake-provider test or simply obtaining an API key.

## 12. Validation and acceptance checklist

Historical local verification already completed: build/typecheck, 11 TypeScript checks, 61 backend checks, 12/12 local evaluations, 17 affected browser checks and final role/cancellation checks. Cleanup additionally passed 14 focused backend checks and two report/scenario browser checks. These are local/fake-provider results; Linux images, live Gemini, VM recovery and public identity still require validation.

Standard commands from the repo root:

```bash
npm ci
npm run typecheck
npm test
npm run test:backend
npm run evaluate
npm run build
node scripts/runtime/python.mjs scripts/checks/verify_customer_integrity.py
node scripts/runtime/python.mjs scripts/checks/verify_recovery.py
```

Install the pinned Python dependencies first. On Linux the launcher defaults to `backend/.venv/bin/python`; use `RISKLENS_PYTHON` if needed. Browser checks require Chromium on Linux (`npx playwright install --with-deps chromium`). Point browser tests at the intended private QA server with `RISKLENS_BROWSER_BASE_URL`, e.g. port 3100.

**Run write/import/approval/browser tests on an isolated test database/checkpoint copy**, not the migrated working state. Set `RISKLENS_DB` and `RISKLENS_CHECKPOINT_DB` before importing/starting the backend for tests; keep provider local unless a separate authorized live-model test is intended. The recovery/evaluation utilities use temporary datasets. Do not run an explicit seed against the working store to make tests pass.

Acceptance before cutover:

- [ ] Verify source package/revision contains all latest changes and required untracked files.
- [ ] Restore database/checkpoint pair, matching fixture/cache and migration checksums without reseeding.
- [ ] Reconcile original IDs/counts, product parent joins, report hashes and source periods/currencies.
- [ ] Restore at least two existing chats, a corrected form and an existing saved report using authorized workspace mapping.
- [ ] Test fictional OCR → corrected Markdown → staff submission → admin approval/rejection. Submission/rejection adds no customer; approval/retry adds exactly one profile or links the selected existing profile.
- [ ] Test duplicate decisions, rejected/stale/conflicting requests and linked KYC access, including another tenant's denial.
- [ ] Confirm Viewer/Analyst cannot directly write records or approve requests; production rejects spoofed demo headers.
- [ ] Reconcile fraud/loan figures across chat, dashboard, evidence, investigation and export. Current original demo reference: fraud 833 → 1,091; default markers 648 → 765.
- [ ] Validate supported fraud scenarios and backend report generation; unsupported loan scenarios do not use a mock fallback.
- [ ] Validate Linux OCR limits, CSV/Excel mapping/errors/import retry and preserved linked IDs in QA.
- [ ] Confirm SSE progress/cancellation/replay works through the chosen proxy; show safe status only, never chain-of-thought.
- [ ] Restart containers and reboot the VM; all persisted state remains. Test a backup restore, not only backup creation.
- [ ] If Vertex is activated, evaluate real model outputs/failures/grounding and truthful outbound-data disclosure; do not report local evaluation scores as Gemini scores.
- [ ] Record the deployed revision, access method, storage locations, configured model/region, validation evidence, rollback procedure and remaining limitations in the existing docs.

## 13. Instructions to the receiving agent

Read the files above and inspect the actual source/state before changing anything. Continue from the current product rather than rebuilding it. Preserve the approved UI, three-role model, dataset identities, safe tool boundaries, explicit admin approvals, owned chat history and immutable reports.

First solve the source/state transfer and private restore; then address verified identity, provider activation and deployment gaps in order. Use placeholders only where project/VM/domain/model details are genuinely missing. Ask the owner for those missing deployment details without requesting secret keys in chat. Keep current local work recoverable, document actual checks honestly and never treat migration, authentication, model activation and public deployment as the same completed step.
