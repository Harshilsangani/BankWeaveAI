# BankWeave AI — banking data blueprint

Prepared 7 October 2026. This is a proposed data design and source catalogue, not an implemented database or a claim that public datasets have been imported.

## Recommendation

Build one internally consistent synthetic bank as the main demonstration dataset. Use public datasets as separate domain benchmarks and official Indian statistics as external context. None of the sources below supplies a complete linked bank across customers, deposits, payments, loans, operations and policies.

Keep the bank-wide schema in view, but implement a small first slice. Existing frontend response blocks can continue to receive charts, KPIs, tables and evidence from validated backend queries.

## Public sources found

The following are primary publisher sources. Source pages were checked; bulk files, file integrity and complete import mappings have not been verified. RBI and NPCI use dynamic pages; the banking/statistics categories were corroborated through indexed official pages, rather than a complete current data export.

| Source | What it contains | Best use in BankWeave | Access and limitations |
| --- | --- | --- | --- |
| [IBM TabFormer](https://github.com/IBM/TabFormer) | Synthetic credit-card transactions; publisher describes 24 million records. | Fraud trends, merchant/channel analysis and transaction sequences. | Git LFS or publisher-linked Box download. Repository displays Apache-2.0; inspect distribution-specific data terms before redistribution. Does not establish an Indian bank or our device history. |
| [IBM AML-Data](https://github.com/IBM/AML-Data) | Synthetic financial transactions with laundering labels, generated across banks, people and companies. | Transfer-network analysis and evaluating AML alerts. | Publisher links to Box and Kaggle. **Actual data uses CDLA-Sharing-1.0**, distinct from the Apache-2.0 repository licence. Keep evaluation labels out of detection inputs. |
| [UCI Default of Credit Card Clients](https://archive.ics.uci.edu/dataset/350/default+of+credit+card+clients) | 30,000 Taiwanese credit-card clients; limits, payment status, bills, payments and next-period default labels. | Credit-risk benchmark and repayment-history examples. | Downloadable XLS; CC BY 4.0. Historical 2005 data in NT dollars, not an Indian loan portfolio. |
| [UCI Bank Marketing](https://archive.ics.uci.edu/dataset/222/bank+marketing) | Portuguese bank campaign records and term-deposit subscription outcomes; multiple dataset versions. | Customer segmentation, campaign conversion and deposit acquisition examples. | Downloadable ZIP/CSV; CC BY 4.0. Select one documented version. Call duration is unavailable before a call and must not enter a pre-call prediction. |
| [RBI data releases](https://statistics.rbi.org.in/) and [DBIE](https://data.rbi.org.in/) | Deposit/credit statistics, branch banking statistics, bank profiles, rates and payment statistics. | Indian banking context, regional deposit/credit comparisons and macroeconomic scenario inputs. | Mostly published statistics rather than individual customer histories. Record each series' actual period, unit and coverage; check publication reuse terms. |
| [NPCI UPI ecosystem statistics](https://www.npci.org.in/what-we-do/upi/upi-ecosystem-statistics) | Published UPI ecosystem statistics including state volume/value and merchant-category context. | Indian digital-payment benchmarks and realistic channel/region distributions. | Aggregate statistics, not customer-level transactions. Verify the selected reporting month; do not treat cached figures as current. Check source terms before redistribution. |
| [CFPB Consumer Complaint Database](https://www.consumerfinance.gov/data-research/consumer-complaints/) | Published US financial complaints, product/issue categories and company responses. | Customer-service issue taxonomy and complaint-analysis benchmark. | Public CSV/API; publisher says published data is freely available for reuse. Complaints are not a representative sample of all customers. No matching customer IDs for our bank. |

Suggested first source to inspect: IBM TabFormer for the existing fraud experience. UCI credit defaults is a small independent benchmark for lending. RBI/NPCI provide local context. Keep AML and complaints as separate follow-on imports.

Additional user-proposed candidate: [BankShield](https://huggingface.co/datasets/Abdulmajeedyahya/BankShield-Enterprise-Grade-Multi-Pattern-Dataset). We downloaded and audited its five public sample tables. It is relevant for transaction/alert analytics, but most sample foreign keys do not resolve, no alert has a complete customer/account/transaction chain, and transaction records have no device ID. The full release is a separate paid product and has not been audited. See [the detailed review](artifacts/bankshield-review/REVIEW.md) and its adjacent `audit.json` before selecting it for the connected investigation demo.

### Verified example source fields

These are publisher fields, separate from the proposed internal schema below.

- UCI credit defaults: `ID`, `LIMIT_BAL`, `AGE`, monthly repayment-status fields, `BILL_AMT1`–`BILL_AMT6`, `PAY_AMT1`–`PAY_AMT6`, and the next-period default target. The publisher also includes demographic attributes; inclusion in the source is not a recommendation to use all of them in risk decisions. [Variable definitions](https://archive.ics.uci.edu/dataset/350/default+of+credit+card+clients).
- UCI marketing, classic version: `age`, `job`, `marital`, `education`, `default`, `balance`, `housing`, `loan`, `contact`, `day`, `month`, `duration`, `campaign`, `pdays`, `previous`, `poutcome`, `y`. The additional version has a different schema. [Version details](https://archive.ics.uci.edu/dataset/222/bank+marketing).
- CFPB: complaint ID, date received, product/sub-product, issue/sub-issue, company, state, submitted via, date sent to company, company response and timely response. Map exact export names during ingestion. [Official field reference](https://cfpb.github.io/api/ccdb/fields.html).

Do not join unrelated source records by row number, age or a randomly assigned customer ID. Keep original IDs under a source namespace. Public aggregate context may be compared by compatible period, geography and unit. Any new synthetic relationships must be explicitly marked as generated.

## Common column and storage conventions

The following conventions apply to the proposed schema, not to downloaded files.

| Convention | Design |
| --- | --- |
| IDs | Stable text/UUID primary keys. Foreign keys must reference an existing record in the same workspace/dataset. |
| Monetary amounts | Integer minor units, e.g. paise, with `currency` as a separate ISO currency code. Use decimal arithmetic for rates and conversions; do not store formatted `₹1.84 Cr` strings as source amounts. |
| Times | UTC timestamps for events; explicit business date and reporting timezone for daily/monthly aggregations. Store full dates, not only `Sep`. |
| Rates and scores | Document the scale and version. Store rates consistently, e.g. 0.08 for 8%. A risk score is not a calibrated probability unless validated as one. |
| Missing values | Nullable unknown values; never replace missing income, labels or device information with zero or false. |
| Status | Validated enums with documented transitions. Posted, failed, pending and reversed transactions have different metric treatment. |
| Provenance | Imported/generated business records carry `dataset_id`, `source_record_id`, `ingested_at`, `is_synthetic`; source metadata carries URL, licence, original geography and currency. |
| Scope | Business and application records carry `workspace_id`. Enforce it server-side when querying and joining. |
| Historical meaning | Record event time and observation/decision time separately where relevant. Answers use an explicit `as_of` date and available information at that time. |

Tables below list domain columns in addition to these shared metadata fields. `?` means nullable or conditional; IDs named in the relationship column are foreign keys. Aggregates and confidence values must have a documented definition and origin.

## Core banking tables

| Table / one row represents | Proposed domain columns | Relationships and purpose |
| --- | --- | --- |
| `branches` / one branch | `branch_id`, `name`, `city`, `district`, `state`, `region`, `country`, `opened_on`, `closed_on?`, `status` | Branch hierarchy for geographic analysis. City and region are separate fields. |
| `products` / one product definition | `product_id`, `name`, `category`, `currency`, `effective_from`, `effective_to?`, `terms_document_id?` | Categories include savings/current/term deposit, card and loan products. Version product terms. |
| `customers` / one customer | `customer_id`, `home_branch_id`, `customer_type`, `segment`, `age_band?`, `occupation_or_industry?`, `income_band?`, `annual_turnover_minor?`, `country`, `state`, `onboarded_at`, `status` | Links to branches. Support individuals and businesses. Use fictional or tokenized identities for the demo. |
| `customer_risk_snapshots` / one customer at an observation time | `snapshot_id`, `customer_id`, `as_of`, `credit_score?`, `score_provider?`, `score_version?`, `aml_risk_band?`, `score_available_at` | Makes changing customer risk measurable without overwriting history. |
| `accounts` / one account | `account_id`, `branch_id`, `product_id`, `currency`, `opened_at`, `closed_at?`, `status`, `overdraft_limit_minor?` | Links to branches/products. Balances live in dated snapshots. |
| `customer_accounts` / one ownership relationship | `customer_id`, `account_id`, `ownership_role`, `valid_from`, `valid_to?` | Supports joint accounts and business signatories. Do not multiply transaction totals when joining joint owners. |
| `account_balance_daily` / one account per business date | `account_id`, `business_date`, `opening_balance_minor`, `closing_balance_minor`, `available_balance_minor` | Deposit trends, withdrawals and dormant-account activity. Unique account/date key. |
| `term_deposits` / one deposit contract | `deposit_id`, `account_id`, `principal_minor`, `currency`, `interest_rate`, `started_on`, `matures_on`, `renewal_instruction`, `closed_on?`, `status` | Deposit maturity concentration and renewal analysis. |
| `transactions` / one customer-facing payment or transfer | `transaction_id`, `occurred_at`, `posted_at?`, `debit_account_id?`, `credit_account_id?`, `external_counterparty_id?`, `initiating_customer_id?`, `origin_branch_id?`, `amount_minor`, `currency`, `type`, `channel`, `status`, `failure_code?`, `merchant_id?`, `card_id?`, `device_event_id?`, `reversal_of_id?` | Accounts, counterparties, merchants, cards and device events. One internal transfer can have both debit/credit sides; count it once as a payment. |
| `counterparties` / one external beneficiary or sender | `counterparty_id`, `entity_type`, `display_label`, `bank_code?`, `country`, `account_token?`, `first_seen_at` | External transfers need not imply the other account belongs to our bank. |
| `cards` / one issued card token | `card_id`, `account_id`, `product_id`, `issued_at`, `expires_on`, `status`, `credit_limit_minor?` | Card exposure and status; use tokens, not real card numbers. |
| `merchants` / one merchant | `merchant_id`, `display_name`, `mcc`, `country`, `state?`, `city?`, `onboarded_at?` | Merchant concentration and category analysis. Risk assessments are separately versioned. |
| `devices` / one pseudonymous device | `device_id`, `device_type`, `os_family?`, `first_observed_at` | A device can be seen across several customers. |
| `device_events` / one session/authentication event | `event_id`, `customer_id`, `device_id`, `occurred_at`, `event_type`, `auth_result`, `country?`, `city?`, `ip_token?`, `session_id?` | Calculate new-device and shared-device features using previous observations, not future records. |
| `loans` / one loan contract | `loan_id`, `customer_id`, `branch_id`, `product_id`, `disbursed_on`, `principal_minor`, `currency`, `interest_rate`, `rate_type`, `tenure_months`, `maturity_date`, `status` | Loan terms; outstanding exposure changes through snapshots/payments. |
| `repayment_schedule` / one scheduled instalment | `instalment_id`, `loan_id`, `due_date`, `principal_due_minor`, `interest_due_minor`, `fees_due_minor` | Establishes the amount and date owed. Schedule versions are needed if restructured. |
| `loan_payments` / one actual repayment | `payment_id`, `loan_id`, `transaction_id?`, `paid_at`, `amount_minor`, `currency`, `status` | Link posted repayments to the payment ledger where available. |
| `payment_allocations` / one repayment allocation | `allocation_id`, `payment_id`, `instalment_id`, `principal_minor`, `interest_minor`, `fees_minor` | Partial payments and payments covering multiple instalments reconcile to the payment amount. |
| `loan_snapshots` / one loan at a reporting date | `loan_id`, `as_of_date`, `outstanding_principal_minor`, `overdue_amount_minor`, `days_past_due`, `performance_status`, `classification_rule_version` | Portfolio trends, delinquency and concentration. Define demo default/NPA rules explicitly; do not assume they are regulatory classifications. |
| `fraud_alerts` / one detector alert | `alert_id`, `transaction_id`, `detected_at`, `rule_id`, `rule_version`, `risk_score`, `severity`, `status`, `case_id?` | An alert is a suspicion, not proof of fraud. Several rules may alert on the same transaction. |
| `fraud_outcomes` / one adjudication version | `outcome_id`, `transaction_id`, `adjudicated_at`, `outcome`, `confirmed_loss_minor?`, `recovered_amount_minor?`, `label_source`, `supersedes_id?` | Outcomes include confirmed fraud, legitimate and inconclusive. Separate confirmed loss from transaction exposure. |
| `kyc_cases` / one review | `case_id`, `customer_id`, `review_type`, `opened_at`, `due_at`, `closed_at?`, `status`, `finding_code?`, `policy_version_id` | KYC review backlog and policy-linked evidence. |
| `aml_cases` / one suspicious-pattern case | `case_id`, `opened_at`, `pattern_type`, `severity`, `status`, `assigned_role?`, `closed_at?`, `policy_version_id?` | Use `aml_case_transactions(case_id, transaction_id)` and `aml_case_customers(case_id, customer_id)` for multi-entity networks. |
| `complaints` / one service complaint | `complaint_id`, `customer_id?`, `account_id?`, `branch_id?`, `product_id?`, `issue_type`, `summary`, `opened_at`, `sla_due_at`, `closed_at?`, `status`, `resolution_code?`, `satisfaction_score?` | Service patterns, unresolved complaints and SLA performance. |
| `service_events` / one service request | `event_id`, `branch_id?`, `customer_id?`, `channel`, `service_type`, `started_at`, `completed_at?`, `wait_seconds?`, `outcome`, `incident_id?` | Branch queues and channel performance. Branch and incident fields may be absent. |
| `channel_incidents` / one operational incident | `incident_id`, `channel`, `service_name`, `started_at`, `ended_at?`, `severity`, `status`, `cause_code?` | Explain spikes in failed payments and service complaints without claiming causation from correlation alone. |
| `campaign_contacts` / one customer contact | `contact_id`, `campaign_id`, `customer_id`, `product_id`, `contacted_at`, `channel`, `outcome`, `conversion_at?`, `converted_account_id?` | Deposit acquisition and conversion; count distinct conversions with a documented attribution window. |

## Financial and wider bank coverage — later phases

These domains extend the product beyond retail fraud and lending. They should not delay a working first backend slice.

| Table / grain | Proposed columns | What it enables |
| --- | --- | --- |
| `gl_accounts` / one ledger account | `gl_account_id`, `name`, `account_class`, `normal_balance`, `currency` | Classify assets, liabilities, equity, revenue and expense. |
| `ledger_entries` / one journal line | `entry_id`, `journal_id`, `gl_account_id`, `customer_account_id?`, `branch_id?`, `product_id?`, `transaction_id?`, `posted_at`, `debit_minor`, `credit_minor`, `currency` | Reconciled financial reporting. Journal debits/credits must balance in each currency; business payments and journal lines have different counting grains. |
| `cost_allocations` / one cost allocation | `allocation_id`, `period`, `branch_id?`, `product_id?`, `cost_type`, `amount_minor`, `currency`, `allocation_method`, `method_version` | Branch/product profitability with explainable allocation. Derive revenue from appropriate ledger entries, not transaction volume. |
| `treasury_positions` / one position at a date | `position_id`, `instrument_id`, `as_of_date`, `asset_class`, `currency`, `market_value_minor`, `maturity_date?`, `rate_type?`, `counterparty_id?` | Maturity and investment concentration; market-risk models require additional instrument/rate data. |
| `liquidity_cashflows` / one dated projected flow | `flow_id`, `source_type`, `source_id`, `as_of_date`, `flow_date`, `direction`, `amount_minor`, `currency`, `scenario_id?`, `assumption_version` | Illustrative liquidity stress scenarios. Contractual and modeled behavioral flows must be distinguished. |
| `collateral` / one valuation | `valuation_id`, `loan_id?`, `trade_contract_id?`, `asset_type`, `valued_on`, `value_minor`, `currency`, `valuation_source`, `valuation_method` | Coverage and valuation sensitivity. Link each demo valuation to a loan or trade-finance contract. |
| `trade_finance_contracts` / one facility/contract | `contract_id`, `customer_id`, `branch_id`, `facility_type`, `counterparty_country`, `issued_on`, `expires_on`, `amount_minor`, `currency`, `status` | Guarantees/letters of credit and cross-border concentration; collateral valuations link through `trade_contract_id`. |
| `external_indicators` / one published observation | `indicator_id`, `series_id`, `period`, `published_at`, `geography`, `value`, `unit`, `currency?`, `coverage`, `source_url`, `revision` | RBI/NPCI or other official context, retaining original units and publication dates. |

Regulatory capital, derivatives, detailed balance-sheet stress testing and regulatory reporting require additional models and authoritative definitions. The first demo must not present approximate simulations as certified regulatory calculations.

## Data specifically needed by the AI Analyst

An AI Analyst needs structured records, meaning for those records, and retrievable policy evidence. For this architecture, training Gemini from scratch is unnecessary. The model selects backend tools; the backend validates parameters and computes results; the response cites the result and retrieved documents. This is consistent with [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling).

| Table / asset | Required columns or contents |
| --- | --- |
| `metric_definitions` | `metric_id`, `name`, `description`, `unit`, `grain`, `numerator`, `denominator`, `allowed_filters`, `time_basis`, `source_tables`, `definition_version`, `effective_from`, `approved_query_id`. Include fraud count/rate, exposure, confirmed loss, overdue-loan rate, deposit growth and complaint SLA rate. |
| `policy_documents` | `document_version_id`, `document_id`, `title`, `category`, `source_url?`, `version`, `published_at`, `effective_from`, `effective_to?`, `jurisdiction`, `approval_status`, `is_demo_policy`, `access_scope`, `content_hash`. |
| `policy_chunks` | `chunk_id`, `document_version_id`, `section`, `page_or_anchor`, `text`, `embedding_ref?`. Retrieval must preserve source/version/section citations. |
| `tool_registry` | Tool name, description, validated parameter schema, output schema, permitted roles, metric definitions, supported date range and timeout. This can initially be versioned configuration rather than a database table. |
| `conversations` / `messages` | Conversation ID, workspace/user ID, message ID, role, content/response blocks, created time, context scope, parent message ID. Preserve follow-up region/date/domain filters explicitly. |
| `tool_runs` | `run_id`, `message_id`, `tool_name`, validated arguments, `started_at`, `finished_at`, `status`, `dataset_version`, `result_ref`, `result_hash`, `error_code?`. These support safe high-level progress and reproducible evidence. |
| `evidence_refs` | `evidence_id`, `run_id?`, `document_version_id?`, `chunk_id?`, `record_ids?`, `metric_id?`, `filters`, `as_of`, `coverage`, `limitations`. Every analytical claim should identify its supporting computation or source. |
| `investigations` / `investigation_events` | Investigation ID, linked risk/case IDs, scope, created time, status, findings, evidence refs, recommended actions; events contain time, operational stage and result reference. Store operational status, not hidden chain-of-thought. |
| `scenarios` | `scenario_id`, `baseline_dataset_version`, `as_of`, assumptions, assumption version, model version, results, created time. All scenario results must be labeled hypothetical. |
| `reports` | `report_id`, investigation/scenario IDs, scope, evidence refs, created time, dataset version, policy versions, export reference. |
| `evaluation_cases` | `case_id`, question, intent, expected scope/tool, expected metric/result, required evidence, forbidden claims, dataset version, tolerance. Keep expected answers outside production retrieval. |

Knowledge content should include product terms, fraud escalation procedures, loan servicing rules, KYC/AML procedures, complaints handling and metric definitions. Use official regulatory documents with verified versions and jurisdiction; author bank-specific procedures as clearly labeled fictional demo policies where no real internal policy exists.

Suggested initial evaluation set: 30 questions spanning bank domains, follow-ups, empty results, unknown fields, comparison denominators and policy versions. A missing domain should return a clear coverage limitation rather than invented numbers.

Example future tools: `get_fraud_summary`, `find_shared_devices`, `get_loan_delinquency`, `get_deposit_trends`, `get_branch_performance`, `get_complaint_summary`, `search_policies`. These are proposed tools, not existing backend functionality. Preserve the existing frontend KPI/chart/table/evidence contracts.

## How the records connect

```text
branches -> customers -> customer_accounts -> accounts -> daily balances
                 |                              |
                 |                         transactions -> merchants/cards
                 |                              |
                 |                        fraud alerts -> outcomes
                 |
                 +-> loans -> schedules <- payment allocations <- payments
                 |      +-> dated loan snapshots
                 +-> devices via device events -> transactions
                 +-> KYC/AML cases, complaints and campaign contacts

ledger entries -> reconciled financial metrics
tools -> computed results -> evidence -> AI response blocks -> investigations/reports
policy documents -> versioned chunks -> cited policy explanations
```

## Questions that prove bank-wide coverage

| AI Analyst question | Data needed |
| --- | --- |
| Why did suspicious card activity increase this month? | Transactions, distinct alerts, merchant/device history and prior period. Separate suspicion from confirmed fraud. |
| Which region has the highest overdue-loan rate? | Loan snapshots, branches, reporting date and an explicitly defined eligible portfolio denominator. |
| Are deposits falling because customers are withdrawing money? | Daily balances and posted inflow/outflow transactions. Check closures, internal transfers and other explanations. |
| Which branches are profitable? | Ledger revenue/expenses and documented cost allocations. |
| Are shared devices concentrated among newly opened accounts? | Account opening dates, device events, ownership links and a comparison population. |
| Which customers have overdue KYC reviews? | KYC case due dates/status, customer identity tokens and applicable policy versions. |
| Did a payment incident coincide with increased complaints? | Failed transaction history, incidents, service events and complaints in compatible time windows. |
| What happens if overdue loans increase and deposit renewals fall? | Loan/deposit snapshots, maturities and a versioned scenario model with explicit assumptions. |
| Which policy supports the recommended next action? | Relevant policy version, effective dates and cited sections. |

## Current gaps in this repository

The existing `types/index.ts` represents branches, customers, accounts, transactions, loans and fraud alerts. It supports a convincing initial fraud/loan demo, but not a complete bank data model.

- `Account.balance` is a current value; add dated balances before claiming deposit trends.
- `Loan.defaultMonths` is a synthetic marker; add repayment schedules, actual payments and dated performance snapshots before building credit analytics.
- `Transaction.flagged` and generated alerts identify suspicious records; add adjudicated outcomes before naming them confirmed fraud or claiming actual losses.
- `Transaction.newDevice` is a fixture attribute; derive it from event history for reproducible investigations.
- Customer credit scores need an observation date/provider/version if analyzed over time.
- Add currency, full-date reporting, transaction direction/status, ownership relationships and provenance.
- Add service, deposit, operational and financial tables before enabling answers in those domains. Domain types currently cover fraud and loans only.

## Build order

1. **Define the canonical schema and metric definitions first.** Select a fixed demo reporting date and an INR-focused fictional bank. Preserve a separate regression fixture for the current April–September 2026 story.
2. Seed the existing customer/account/branch/transaction/loan records into the local backend database. Add repayment history, balance history, merchant/device events and distinct alert/outcome tables. Validate relationships, financial flows and metric denominators.
3. Add deposits, KYC/AML and complaints so the analyst can answer across major retail banking domains. Keep these scenarios small and explainable.
4. Implement deterministic validated query tools and evidence outputs. Test expected answers before introducing Gemini orchestration.
5. Inspect/sample public domain datasets into separate staging namespaces, retaining their dates/currency/licence. Use them for independent benchmarks or explicitly documented calibration, rather than manufacturing cross-source identities.
6. Connect the AI Analyst to query tools and policy retrieval. Add financial/treasury/trade-finance modules after the core questions work reliably.

Possible expanded demo size, after the first slice works: 5,000 customers, 8,000 accounts, 100,000–250,000 transactions, 2,000 loans and 12 months of history. These are proposed development targets, not figures from public sources. Use a deterministic seed and preserve complete relevant histories when sampling.

Intentional demo patterns can include a shared-device fraud cluster, a region with rising overdue instalments, term-deposit maturity concentration, a payment outage linked to increased complaint volume, and delayed KYC reviews. Findings must follow from generated records and computed metrics.

## Acceptance checks for the first data slice

- All foreign keys resolve; account ownership and branch assignments use compatible effective dates.
- Opening balance plus posted credits minus posted debits reconciles to closing balance; reversals and fees are included under the documented rules.
- Repayment allocations reconcile to actual payments; loan balances and overdue amounts reconcile to schedules and payment history.
- Payment counts do not double-count internal transfer sides, joint owners or multiple alerts on one transaction.
- Ground-truth outcomes and future information are excluded from historical detection inputs.
- KPIs, charts, evidence and report totals agree for the same scope and dataset version.
- Source datasets, synthetic enrichment and scenario projections remain distinguishable.
- The analyst responds with a coverage limitation when the necessary tables or policy versions are absent.
