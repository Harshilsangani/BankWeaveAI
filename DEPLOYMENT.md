# Local packaging and GCP handoff

## Repeatable local setup

Use Node 24 and Python 3.11. Create a fresh virtual environment without `--system-site-packages`. Run `npm ci`, then install `backend/requirements.lock.txt`. Apply `npm run backend:migrate`, then explicitly run `npm run backend:seed`. Start with `npm run dev`. Migration never seeds or clears source records; automatic seeding is disabled unless explicitly enabled in development.

`schema_migrations` records checksummed SQL files. Add a new migration instead of modifying an applied file. A failed upgrade rolls back its schema changes. Back up both the application database and graph checkpoints before upgrades. `scripts/verify_recovery.py` tests edits, pending reviews and idempotent confirmation across three fresh processes.

The `.env.example` documents disabled cloud defaults. Next reads `.env.local`; export backend settings in the process environment. Never put credentials in browser-exposed `NEXT_PUBLIC_*` variables. The Gen AI SDK is installed for adapter contract tests; installation does not activate cloud requests.

## Private container demo

The frontend Dockerfile packages Next's standalone output. The backend image runs migrations, then FastAPI under an unprivileged user. Health checks and bounded requests are included. `compose.yaml` binds development services to loopback and mounts `/data` for SQLite/checkpoints.

Before the first container seed, export the fixture with `node --import tsx scripts/export-demo.ts`. After building and starting the backend, copy `backend/storage/meridian.json` into `/data/meridian.json` using `docker compose cp`, then run `docker compose exec backend python -m backend.import_data`. Subsequent restarts do not seed. BankShield is fetched only by the explicit seed command.

Docker is not installed on the development machine used for these changes. Image build, Linux OCR libraries, compose startup and Cloud Run ingress/streaming need container validation before release. Production backend images reject development identity headers; do not treat a healthy container as an authenticated public product.

## Durable database/checkpoint migration — G04

SQLite is the implemented local driver. Database and checkpoint paths are independently configurable; unsupported drivers fail explicitly. Managed SQL/checkpoint stores are not implemented or tested yet.

Include the `conversations` table introduced by migration `015_conversations`. Preserve its workspace foreign key, per-chat scope/message references and active-conversation state along with `session_artifacts`; test reopening two chats and a reviewed form after migration/redeployment.

At G04 choose one managed relational store, implement its connection/transaction adapter and translate SQLite-specific JSON/date queries. Use a compatible durable LangGraph saver instead of container-local checkpoint files. Export every applied migration's canonical tables with `(dataset, id)` identities and integer monetary units: source records, profiles/form versions, sessions, artifacts/report files, cases/dispositions, policy library, detector runs, import previews/receipts, repayments, insurance, preferences/recommendation runs/reviews, cashflow, KYC cases, maintenance receipts/events and audits. Migrate graph checkpoints as a matched set. Import to a staging schema, reconcile source counts/hashes and recover a pending review before switching traffic. Keep BankShield's incomplete relationships visible.

Do not run the fixture seed over migrated source data. The seed intentionally replaces original banking fixture tables; generated product inserts and reviewed profile edits are preserved, but that is not an import/migration strategy. Back up local databases before any explicit reseed.

For rollback, stop writes, restore the application/checkpoint backups as a matched pair, point a private runtime back to the previous schema and verify that repeated confirmation cannot add a second customer. Do not apply destructive down-migrations to edited banking records. Backup recovery in the actual managed store remains a live G04 acceptance check.

## Activation remains pending

G01 project/billing; G02 live Gemini; G03 container deployment; G04 managed durability; G05 verified staff identities; G06 private retained artifacts; G07 cloud telemetry/limits; G08 scheduled jobs; G09 verified data handling. Production currently fails closed for staff requests until identity integration is configured.

### Reviewed file imports in managed storage

Migration `016_structured_imports` adds `file_import_uploads`, `file_import_reviews` and `record_import_sources`. G04 must migrate their contents, ownership and immutable receipt references. G06/G09 must define retention/expiry/deletion for parsed staging rows, reviews and receipts: the original file bytes are discarded, but parsed information remains. G05 must replace development actors and define any cross-staff review handoff; local staged imports are scoped to their originating workspace/actor. Do not deploy an arbitrary SQL-file execution endpoint.
