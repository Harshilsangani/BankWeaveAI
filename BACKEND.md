# Backend implementation status

Fraud analysis and reviewed customer form onboarding now run through local FastAPI, LangGraph and SQLite. See [implemented architecture, setup, tool boundaries and verification](backend/README.md). Gemini/Vertex integration is deferred until GCP deployment.

# Original backend planning notes

These notes predate the current implementation and are retained as an archive. Their pending checkboxes and in-memory state descriptions are not current status. Dashboard/loan SQL, policy retrieval and durable multi-conversation history are implemented locally; see [current feature status](FEATURE_ROADMAP.md) and [backend architecture](backend/README.md). Live Gemini and managed GCP infrastructure remain pending.

## 1. Datasets the backend needs

### 1.1 Core tables (required on day one)

Derived from [`types/index.ts`](types/index.ts) and what
[`services/analytics.ts`](services/analytics.ts) actually queries.

| Table          | Key columns                                                                                                                                                        | Used for                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `branches`     | `id`, `name`, `region`                                                                                                                                             | All region scoping, regional charts, segment tables       |
| `customers`    | `id`, `branch_id`, `age_group`, `occupation`, `credit_score`                                                                                                       | Population denominators, KYC evidence                     |
| `transactions` | `id`, `account_id`, `customer_id`, `branch_id`, `month`, `timestamp`, `amount`, `channel`, `merchant_category`, `device_id`, `new_device`, `flagged`, `risk_score` | Fraud analytics, device-cluster pattern, evidence records |
| `loans`        | `id`, `customer_id`, `branch_id`, `type` (Secured/Unsecured), `amount`, `default_months[]`                                                                         | Default analytics, credit-risk scope                      |
| `fraud_alerts` | `id`, `transaction_id`, `reason`, `status`                                                                                                                         | Alert evidence, review workflow state                     |
| `policies`     | `id`, `title`, `category`, `version`, `summary`, `sections[]`                                                                                                      | Knowledge library, future RAG corpus                      |

Fixture scale for reference: 10,000 customers, 120,000 transactions (20,000 × 6
months), 8,000 loans, 4 branches, 6 monthly periods (Apr–Sep 2026).

### 1.2 Backend-owned tables (do not exist yet — the client fakes them)

| Table                        | Purpose                                          | Faked today by                                                            |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `risk_events`                | Detected signals with severity, status, exposure | Hardcoded 3-row list in `buildRisks()`                                    |
| `investigations`             | Persisted investigation per risk + scope         | Rebuilt on every call in `buildInvestigation()`                           |
| `scenarios`                  | Saved simulator runs with inputs                 | In-memory React state, lost on reload                                     |
| `reports`                    | Generated reports with IDs/timestamps            | `crypto.randomUUID()` + `Date.now()` on the client, localStorage (cap 20) |
| `conversations` / `messages` | Analyst chat history + context                   | In-memory React state, reset on reload                                    |
| `users` / `workspaces`       | Analyst identity, tenant, preferences            | Hardcoded "Alex Kumar" demo profile; theme/dismissed in localStorage      |
| `audit_logs`                 | Who ran what, when, on which records             | Nothing — no audit trail exists                                           |

### 1.3 Removed as dead surface (do not reintroduce without a consumer)

- `risk_scores` was generated in `data/banking.ts` but never read by any app
  code — removed from the fixture and the `RiskScore` type deleted.
- `Dashboard.transactionCount` / `customerCount` were returned by
  `getDashboard()` but never rendered — removed from the contract.
- `accounts` stays: `tests/analytics.test.ts` enforces its foreign-key
  integrity, and transaction records reference it. The backend still needs the
  table for those joins even though no UI surface reads account rows directly.

## 2. API surface (1:1 with the contract, already live as Next.js routes)

Each path below is served today by `app/api/` over the mock and must keep its
exact response schema when FastAPI takes over — the UI consumes the service
functions and never the fixture.

- `GET /dashboard` → `Dashboard` (metrics, 6-month trend, regional bars, risks,
  recent investigations, snapshot label).
- `GET /risk-radar` → `RiskEvent[]`.
- `POST /investigations` (`riskId`, optional `scope`) → `Investigation`
  (metrics, trend, segment table, findings, evidence, timeline, actions).
- `POST /scenarios` (`riskId`, `coverage`, `effectiveness`, `friction`, optional
  `scope`) → `ScenarioResult`.
- `POST /analyst/queries` (`query`, `context?`, `scenario?`) → `AnalystResponse`
  (discriminated `ResponseBlock` union: TEXT, KPI, CHART, TABLE, INSIGHT,
  EVIDENCE, ACTION, REPORT, COMPARISON).
- `POST /reports` (`investigation`, optional `scenario`) → `Report`.
- `GET /policies` → `Policy[]` (placeholder for RAG retrieval).

### Semantics the backend must reproduce exactly

These are load-bearing definitions; a "close enough" reimplementation silently
breaks every number and all golden tests in `tests/analytics.test.ts`:

- **Scope**: `{ domain, region?, comparison?, minAmount?, newDeviceOnly?, riskId? }`.
  Region filters use **branch location, not customer residence**.
- **Windows**: September 2026 vs August 2026 baseline; trend spans Apr–Sep.
  `analyze(context, month)` takes free-form month strings today — the API must
  accept explicit, validated window parameters instead.
- **Exposure = sum of flagged amounts (or defaulted principal proxy), NOT
  confirmed loss.** Every surface must keep this disclaimer.
- **Scenario formula**: `reduction = exposure × coverage × effectiveness`;
  `challenged = affected × coverage`; `abandoned = challenged × friction`.
  Valid ranges: coverage 0–100, effectiveness 0–100, friction 0–30, fraud domain
  only (loans must return the "not implemented" guidance, matching the mock).
- **Detection story**: flagged 833 → 1,091 Sep-over-Aug; Ahmedabad 333 → 650;
  defaults 648 → 765 on a fixed 8,000-loan population. Seed data must reproduce
  these or the demo narrative breaks.

## 3. Remaining backend work (checklist)

- [ ] **Data layer**: real tables for §1.1 with indexes on
      `(branch_id, month)`, `(flagged, month)`, `(device_id)`, loan default months;
      paginate evidence (the mock slices 6 records — the API must page, not dump).
- [ ] **Analytics parity**: port `analyze/metrics/trend/regions/segmentTable/
evidence/finding/contributionFinding` with golden tests against the current
      fixture values before swapping traffic.
- [ ] **Query validation**: non-empty query, max length, scope-shape validation,
      riskId allowlist, scenario ranges — enforced server-side (see L2).
- [ ] **Gemini orchestration**: replace the regex intent router
      (`resolveContext`) with model + tools; add grounding (every claim traceable to
      evidence blocks), unsupported-input refusal, and prompt-injection guardrails.
- [ ] **Policy RAG**: embeddings + retrieval over `policies` to replace the
      local keyword match; keep version labels in responses.
- [ ] **Detection pipeline**: scheduled jobs that produce `risk_events`
      (replacing the hardcoded three), with thresholds versioned and reviewable —
      Risk Radar must become a real view, not a labeled snapshot.
- [ ] **Report service**: server-side generation, storage, and download;
      retire the client-side builder in `lib/report.ts`.
- [ ] **AuthN/AuthZ + tenancy**: replace the demo profile; scope every query to
      tenant + role; evidence record IDs must respect record-level access.
- [ ] **Audit logs**: investigation opens, scenario runs, report creates/downloads,
      dismissals, and analyst queries — append-only, with actor + timestamp.
- [ ] **Workspace persistence**: reports, dismissed alerts, conversations, and
      context per user; define retention (theme can stay local).
- [ ] **Async jobs / streaming**: replace simulated `delay()` latency with job
      status or streaming for investigation/analyst calls.
- [ ] **Snapshot management**: versioned, immutable monthly snapshots instead of
      the hardcoded `snapshot = "30 Sep 2026"`.
- [ ] **Rate limiting + quotas**: per-user limits on analyst queries, scenario
      runs, and report generation.

## 4. Loopholes (do not ship without closing these)

| #   | Loophole                                        | Where it lives                                                                                                | Why it matters                                                                                                                                                                           |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | No authentication or authorization              | `services/index.ts`, hardcoded profile in `components/shell.tsx`                                              | Anyone with the URL gets the full "bank". Every endpoint must require a authenticated, tenant-scoped caller.                                                                             |
| L2  | No separate-process validation                  | Shape checks in `app/api/*/route.ts`, domain rules in the service layer — but same Node process as the client | Bypassable until validation runs on infrastructure the browser cannot reach. FastAPI must re-validate queries, scopes, and scenario ranges.                                              |
| L3  | IDs minted with no persistence behind them      | `uid()` and `new Date().toISOString()` now run in route handlers, but nothing is stored                       | IDs are server-minted on the browser path, yet forgeable in effect: no record exists to check them against. FastAPI must mint _and persist_ IDs/timestamps.                              |
| L4  | Standalone report HTML assembled in the browser | `lib/report.ts` (`Blob` + anchor click) over a server-created `Report`                                        | The report record is now created server-side, but the downloaded document is still rendered client-side with no download record. Move document rendering + download logging server-side. |
| L5  | Security-relevant state in localStorage/memory  | Reports, dismissed alerts, conversations in `hooks/use-workspace.ts`                                          | Tamperable, device-bound, and invisible to audit. Dismissal of a risk signal must be a server-side audited action.                                                                       |
| L6  | Intent routing is regex over user text          | `resolveContext` in `services/mock.ts`                                                                        | Brittle and gameable today; when Gemini is connected it becomes a prompt-injection surface without grounding + guardrails.                                                               |
| L7  | Static "detections" presented as Radar          | `buildRisks()` fixed 3 rows                                                                                   | Numbers go stale while the UI implies currency. Backend must drive this from a real pipeline or keep the snapshot labeling.                                                              |
| L8  | Exposure easily misread as loss                 | All money surfaces                                                                                            | A backend that relabels or recomputes exposure without the "flagged value, not confirmed loss" disclaimer creates financial-misstatement risk.                                           |
| L9  | Evidence leaks raw record IDs                   | `evidence()` record strings (`TX-…`, amounts, scores)                                                         | Needs RBAC, masking, and retention policy before pointing at real customer data.                                                                                                         |
| L10 | Unvalidated time-window parameters              | `analyze(ctx, "Aug")` free-form month strings                                                                 | Carried into an API as-is, this is an injection/DoS vector. Use validated enums or date ranges.                                                                                          |
| L11 | No pagination or query budgets                  | Full in-memory scans per request                                                                              | Fine for 14k synthetic rows; a real core-banking extract needs bounded queries, indexes, and timeouts.                                                                                   |

## 5. Suggested build order

1. Schema + seed (§1.1) with the §2 semantics pinned by golden tests.
2. Reimplement the read-only §2 endpoints (`dashboard`, `risk-radar`,
   `investigations`) in FastAPI behind auth, preserving schemas exactly —
   the Next.js routes define the reference behavior.
3. `scenarios` + server-side validation (closes L2 for the riskiest input).
4. `analyst/queries` with Gemini + guardrails + audit (closes L6 partially, L5).
5. `reports` server-side generation + storage (closes L3, L4).
6. Detection pipeline + snapshot management (closes L7).
7. Workspace persistence, RAG policies, streaming, rate limits (closes the rest).
