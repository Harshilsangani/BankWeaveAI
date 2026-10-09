# BankShield dataset review for BankWeave

Reviewed 7 October 2026. This is a review of the publicly downloadable sample, not an audit of the commercial full dataset. No application data was replaced.

Source: [Hugging Face dataset](https://huggingface.co/datasets/Abdulmajeedyahya/BankShield-Enterprise-Grade-Multi-Pattern-Dataset).

Pinned repository revision: `e9a38a97f05536cf300bff05d6b6dc833f3a0a8e`.

## Decision

BankShield is a relevant candidate for the fraud feature. Its relational schema and alert fields are useful. The public sample supports standalone transaction and alert analysis, but fails the completeness checks needed for a linked customer/account/transaction/alert investigation.

The full release might address missing parent records; it needs its own validation. The public sample also contains event-order inconsistencies and lacks a transaction-to-device identifier. Do not assume that purchasing the full version resolves those issues.

## Method

Fetched the repository metadata from the Hugging Face API, then downloaded the five CSVs and README at the pinned revision. Parsed every sample row using Python's CSV reader. Checked primary-key uniqueness, nulls, foreign-key membership, complete relationship chains, label representations and selected date relationships. Machine-readable results are in `audit.json` beside this report.

Original downloaded files are in the temporary directory recorded in `audit.json`. No payment, account creation or full-dataset download was performed.

## Actual public files

| File | Rows checked | Columns | Duplicate primary keys |
| --- | ---: | ---: | ---: |
| customers.csv | 2,500 | 16 | 0 |
| accounts.csv | 3,750 | 11 | 0 |
| transactions.csv | 5,000 | 12 | 0 |
| fraud_alerts.csv | 1,100 | 9 | 0 |
| devices.csv | 1,750 | 10 | 0 |

These files have 14,100 rows in total. The public files do not contain the advertised full two-million-transaction release.

## Verified relationship gaps

| Relationship | Rows missing a parent in the public files | Total child rows |
| --- | ---: | ---: |
| accounts.customer_id -> customers.customer_id | 3,548 | 3,750 |
| devices.customer_id -> customers.customer_id | 1,673 | 1,750 |
| transactions.account_id -> accounts.account_id | 4,740 | 5,000 |
| fraud_alerts.transaction_id -> transactions.transaction_id | 1,096 | 1,100 |

Only **10 transactions** have a complete transaction -> account -> customer chain in the sample. **No alert** has a complete alert -> transaction -> account -> customer chain.

This is consistent with separately sampled tables, but the sampling mechanism is not established by these checks. Missing records in a sample do not by themselves prove that the full release has orphaned keys.

## Additional findings

- Of the 260 transactions whose accounts are present, **98 have a transaction business date earlier than the account's opened_date**. This needs explanation or correction before presenting those account histories.
- Transactions contain **device_type**, but **no device_id or device_fingerprint**. Customer ownership of devices cannot tell us which device performed a particular transaction. A shared-device fraud investigation therefore needs additional telemetry or explicitly synthetic enrichment.
- All 1,750 sampled device fingerprints are distinct, and all 5,000 sampled transaction IP strings are distinct. This sample does not demonstrate a repeated fingerprint or repeated IP cluster.
- `transactions.is_fraud` mixes `0`, `1`, `False`, and `True`. Normalize explicitly: there are 42 positive labels after normalization, not 41. Never parse non-empty strings as booleans.
- 19 transactions have missing transaction dates. Exclude them from dated trends with an explicit coverage note; retain them for analyses that do not require a date.
- Some NEW and INVESTIGATING alerts already carry `confirmed_fraud=1`. That may represent synthetic ground truth, not an outcome known when the alert was opened. Preserve ground truth separately and do not present it as a contemporaneous analyst decision without documentation.
- `amount_usd` is the transaction value field, while accounts have several currencies. Do not sum account balances across currencies or relabel transaction amounts as INR. Preserve the documented units and use explicit conversion provenance if conversion is needed.
- Dates in the observed transaction sample span January 2021 to June 2024. Present the selected historical reporting period in the UI.
- There are no loan repayments, branches, daily balance histories or complaint tables among the published five CSVs. This does not cover the entire bank-wide data plan.

## Access and licence

The [publisher's full-release listing](https://synthox.gumroad.com/l/jsyco) showed a starting price of USD 79 when checked. The public sample is accessible without authentication. GCP credits do not pay for this separate commercial purchase.

The README says commercial use is permitted under the dataset licence, but the repository file list contains no LICENSE file and the dataset API returned no card licence metadata. Obtain the actual applicable terms before redistribution or a commercial deployment. An absent licence file does not establish that use is forbidden; it makes the scope of permissions insufficiently explicit here.

Publisher descriptions of synthetic generation and production quality are claims, not independent validation. Call this publisher-provided synthetic banking data; do not describe it as real bank data or use its marketing language as evidence that BankWeave is regulatorily compliant.

## Practical options

1. **Use the free sample for transaction trends and alert summaries.** Keep these analyses separate where joins cannot be resolved. Show historical dates, USD units, coverage and missing-link limitations.
2. **Evaluate a complete release or a relationship-preserving sample** if we want this dataset to power the investigation workspace. Require complete parent tables, event-order consistency, formal licence terms and transaction-level device linkage for device investigations.
3. **Keep the coherent BankWeave fixture for the connected demo** and add BankShield as a separately labeled external dataset. Compute findings independently; do not force the existing 31% story onto the source data.

Do not repair the sample by randomly assigning customers, accounts or devices. If we generate enrichment, retain original source IDs and mark the new relationships as synthetic.
