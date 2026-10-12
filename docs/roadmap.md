# Current state and deployment roadmap

Updated 12 October 2026. The current source update on `main` includes the latest features, repository cleanup and migration handoff. Fetch the latest `origin/main` and verify its revision and files rather than using the original `first commit`. Use Git status to identify any subsequent local changes. For migration, start with the [complete GCP agent handoff](gcp-handoff.md), which links all reference files and records the latest read-only state baseline. Runtime databases/checkpoints remain excluded from Git and require a separate private transfer.

## Implemented locally

| Area                                                 | Status                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Dashboard, Risk Radar and scoped fraud/loan analysis | Database-backed historical metrics/evidence                                                              |
| Analyst and history                                  | Inline rich responses, separate saved chats, role greetings and pinned streams                           |
| Forms and approvals                                  | Local Markdown OCR, corrections, duplicate review, locked staff request, atomic admin approval/rejection |
| Data workspace                                       | Shared 10,000 original identities, source browsing, admin CRUD and CSV/Excel imports                     |
| Customer products                                    | Synthetic repayments, insurance, declarations/recommendations and labelled cashflow                      |
| Investigations and reports                           | Observed relationship maps, case history and immutable backend HTML exports                              |
| Knowledge                                            | Versioned documents, lexical retrieval and supplied-section citations                                    |
| Permissions                                          | Viewer, Analyst and Admin; API/tool checks and owned local workspaces                                    |
| Packaging                                            | Locked dependencies, checked migrations, standalone build and container definitions                      |

Local routing/chat is deterministic. Vertex contracts/fake-provider checks exist, but Gemini is disconnected. Detector snapshots are versioned; no continuously running ingestion or monitoring feed exists. Scenarios use explicit assumptions rather than a trained prediction model.

Recent verification: production build/typecheck, 11 TypeScript checks, 61 backend checks (including the corrected admin KYC-handoff assertion), 12/12 local evaluation cases and 17 affected browser flows. Final role/cancellation checks and desktop/mobile light/dark review passed. These are local/fake-provider results, not live Gemini, Docker/Linux OCR or cloud identity acceptance.

## GCP tasks — pending

| ID  | Priority | Work and completion requirement                                                                                                                |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| G01 | P0       | Verify project, actual credit eligibility, billing, APIs, service accounts and budgets.                                                        |
| G04 | P0       | Implement managed application/checkpoint persistence; migrate records and verify restart, redeployment and backup recovery.                    |
| G05 | P0       | Verify staff identities/tenant grants server-side; remove reliance on demo headers/role switching. Test record and approval access end to end. |
| G02 | P0       | Choose an available model/region, activate Vertex and evaluate routing, form extraction, grounded explanations and chart planning.             |
| G03 | P0       | Build/test images and Linux OCR, deploy frontend/backend to Cloud Run and verify the deployed workflows.                                       |
| G07 | P0       | Add usage/token/page limits, quotas, bounded retries, cost monitoring and redacted operational telemetry.                                      |
| G09 | P0       | Verify actual processing location, model data-handling terms/settings, retention/deletion and logging behavior.                                |
| G06 | P1       | Add private retained document/report storage if promised; enforce access, expiry and deletion. P0 if required by the first release.            |
| G08 | P1       | Schedule idempotent ingestion/detection and expose real freshness once jobs run.                                                               |

Start with G01, G04 and G05. Local SQLite inside a Cloud Run container is not a durable cloud datastore. Production currently fails closed without a verified identity adapter. See [deployment details](deployment.md).

Five-year credit graphs require a defined credit metric and dated historical data/import/query support. The present fixture only covers April–September 2026. Gemini chart images are optional; the recommended response path keeps database-calculated series and interactive Recharts blocks.

## Resume safely

- Read [README](../README.md), [architecture](architecture.md), [imports](imports.md) and [deployment](deployment.md).
- Preserve `backend/storage/`, both application/checkpoint databases, original customer IDs, saved chats and local source edits. Do not reset/reseed the working database or edit applied migrations.
- Preserve legacy configuration/header/actor/storage keys; `customer_operator` is an Analyst alias used by older workspaces.
- Latest applied schema: `017_admin_approvals`. New schema work needs a new migration.
- Standard runtime is frontend `127.0.0.1:3000` and backend `127.0.0.1:8000`; check listeners before starting another server. Process IDs are intentionally not stored here.
- Keep future task notes in this roadmap and durable reference material under `docs/`; do not create another completion/resume log for each change.
