# Current state and roadmap

This file describes the submitted implementation. Setup is in [README](../README.md), domain behavior in [architecture](architecture.md), and operational procedures in [deployment](deployment.md).

## Implemented

- Next.js frontend and FastAPI backend, separated by feature ownership, with typed same-origin API gateways.
- SQL-grounded analytical answers, contextual follow-ups, interactive charts, local/Vertex providers and visible execution receipts.
- Research reports with reconciled tables/charts, source references and PDF export; model failures produce explicitly labelled fallbacks.
- Historical risk rules, source/run hashes, dated overdue-principal evidence and coverage limitations.
- Saved investigation inbox, observed relationship maps, staff notes, revision-conflict handling, resolution notes and frozen reports. The optional review assistant prepares source-linked briefs for human review.
- PDF/image form extraction, corrected field reviews, interrupted-submission recovery and explicit Admin approvals. New uploads retain original attachments with workspace ownership and checksum-verified download. Older missing originals remain unavailable.
- Customer directory, accounts/loans/product observations, KYC review and audited maintenance.
- Admin-only validated CSV/Excel banking imports and shared policy publication; policy retrieval preserves exact versioned sections.
- Durable card campaign jobs, synthetic source manifests, explainable eligibility, employee reports, notifications and Admin review. Optional test SMTP delivery is restricted to a configured inbox.
- Analyst/Admin/Viewer role enforcement in HTTP and domain operations. An IAP verification adapter exists but is not activated in the demo.
- Conversation/checkpoint persistence, append-only checksummed migrations and private systemd app/worker supervision.

## Hosted demonstration

The [public synthetic demo](https://35.253.137.87) is separate from the original private workspace. It uses simulated staff roles and server-side Vertex configuration; real campaign email delivery is disabled. The current configured model is `gemini-3.5-flash-lite` at `global`. A new clone defaults to local mode.

The active schema includes `024_form_sources`. Original customer identities, previous reports, saved conversations and applied migration checksums must be preserved during upgrades. Never reseed a working store.

## Remaining production work

| Area                    | Remaining acceptance                                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified identity       | Activate protected ingress and reviewed staff grants; test revocation, session ownership and an authorized recovery mapping for legacy workspaces.                   |
| Managed durability      | Implement the managed relational/checkpoint adapter, reconcile a matched migration and test restoration. SQLite remains the implemented store.                       |
| Retained artifacts      | Define access, encryption, retention, expiry and deletion for uploads, parsed imports, reports and backups. Local SQLite storage is not a complete retention policy. |
| Container/cloud hosting | Run the supplied images and Compose stack, validate OCR/system libraries and test Cloud Run ingress/streaming. Docker execution remains unverified on this VM.       |
| Billing and telemetry   | Verify actual credits, eligible services, project budgets, IAM, request limits and operational alerts.                                                               |
| Processing location     | Verify the intended processing/data-handling requirements for the selected provider; the `global` endpoint does not establish a processing country.                  |
| Data ingestion          | Add authenticated scheduled ingestion and broader historical source coverage. Existing snapshots and rule-based signals are historical.                              |
| Outreach                | Replace the fixed test-inbox integration only after production identity, consent, delivery and operational controls are accepted.                                    |

## Maintenance rules

Keep runtime state and credentials outside Git. Back up application and checkpoint stores together while writers are stopped. Add migrations instead of editing applied SQL. Test write paths on disposable storage. Review source/model receipts before claiming a result used AI successfully. Preserve legacy `RISKLENS_*` configuration and actor/session identifiers.

Review commands and operational limitations are documented in [validation and safe upgrades](deployment.md#validation-and-safe-upgrades). Generated reports, screenshots and historical task notes remain local under ignored `artifacts/`.
