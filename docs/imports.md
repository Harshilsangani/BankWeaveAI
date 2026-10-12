# BankWeave banking data imports

Open **Command Center → View data → Data quality & imports**. Choose Customers, Accounts, Transactions or Loans, then upload a CSV or Excel workbook. Pick a worksheet, review the suggested column mappings, preview validation results and explicitly confirm the batch. Only an admin confirms writes; analysts can stage/review files and viewers can inspect their accessible history. An admin must upload and review the batch in their own workspace; spreadsheet previews are not part of the OCR approval queue. See [roles and approvals](architecture.md#roles-and-approvals).

## Supported files and limits

- `.xlsx` or UTF-8 `.csv`, up to 5 MB. Comma, semicolon and tab-delimited CSVs are recognized.
- Up to 8 worksheets, 500 records per sheet and 2,000 total records per upload. Keep content within 40 columns and the first 2,000 physical rows. Remove unused worksheet formatting when necessary.
- The XLSX processing limit is 20 MB of expanded ZIP content. Macros, external workbook links, formulas and Excel error cells are rejected. Paste values before exporting.
- Headers belong in the first non-empty row and must be unique. Column order and names may differ: map each source column to one record field. Required fields must be mapped. Unmapped columns are ignored.
- `.xls`, `.xlsm`, encrypted workbooks and executable `.sql` dumps are not supported. Save old Excel files as `.xlsx`.

## Linked record order

1. **Customers:** `id`, `fullName`, `dateOfBirth` are required. Optional fields: `email`, `phone`, `address`, `city`, `state`, `postalCode`. IDs currently use the application's `CUS-` format. They are retained and reused across linked sheets. Birth dates use YYYY-MM-DD or typed Excel dates. Customers are pending verification; importing does not approve KYC or open an account. Existing IDs and possible duplicate people are blocked for manual review.
2. **Accounts:** `id`, `customer_id`, `opened_on`. The customer must already exist. Opening dates cannot be future dates.
3. **Transactions:** `id`, `account_id`, `occurred_at`, `amount`, `currency`, `region`, `merchant`, `channel`, `new_device`, `flagged`; optional `device_id` and `score`. The account/customer parent chain must exist. Amounts are decimal currency units, not paise/cents. Flags are 0/1 and supplied source risk scores are 0–100. Missing scores remain NULL/unknown, not zero. These supplied labels are unverified observations, not BankWeave predictions. A new-device marker requires a valid observed device ID.
4. **Loans:** `id`, `customer_id`, `branch_id`, `loan_type`, `principal`; optional `default_months` as semicolon-separated YYYY-MM values. Use an existing branch ID. Principal is in currency units. Missing repayment schedules/payments are not invented. Blank default months means no supplied default observations, not verified absence of defaults.

Customers must be imported before accounts/loans, and accounts before transactions. **Select and confirm each worksheet separately.** This is not a single atomic multi-sheet import. A failed worksheet batch saves no active records. Existing records are never overwritten. Confirmation revalidates parent links, IDs and the dataset revision. If another import changed the dataset, preview again. Repeating an already successful confirmation returns its existing receipt.

## Templates, dates and dataset boundaries

The interface provides a four-sheet fictional Meridian Excel example and individual CSV templates. Change example IDs and details before repeated imports. The Excel example links `CUS-IMPORT-001` to its account, transaction and loan. It uses `BR-AHM`. Importing the unchanged sample is a deliberate demonstration write after confirmation.

Unzoned Excel transaction dates use the explicitly selected India (+05:30) or UTC (+00:00) timezone. Timestamps with their own offsets preserve their time and normalize to UTC. Current analysis remains limited to each dataset's supported historical snapshot periods and currency; these are shown under storage/export guidance. Meridian uses INR and April–September 2026. New arbitrary periods/datasets are not introduced by this feature.

BankShield accepts only transaction appends in its existing USD periods. Its CSV template uses an observed linked source account. No missing customer/account/device relationships or loan records are invented, and the Meridian Excel template is not offered for that dataset.

## SQL database exports

BankWeave already uses SQL-backed storage locally. A bank can export selected customer/account/transaction/loan tables from its database to CSV or Excel and map those columns in the wizard. A `.sql` dump is executable database-specific code, so this upload endpoint never executes it. Controlled database connectors/admin migrations remain separate future integration work. The current customer import expects canonical `CUS-` IDs; arbitrary external ID formats require an explicit identifier adapter rather than silently changing shared IDs.

## Storage and review history

Original file bytes are discarded after parsing. Parsed upload rows, mapped reviews, errors, source hashes, import receipts and confirmed records persist in SQLite. Recent reviews show filename/sheet, entity, row counts, status, saved count and timestamp for the current workspace/staff actor. Imported customer profiles show **Spreadsheet import** and are included in uploaded-profile filters/counts. Row errors can be downloaded as CSV.

Gemini is disconnected. Automatic expiry, complete deletion/retention controls, verified cloud identity and managed storage remain G04/G05/G06/G09 deployment work. Do not interpret disposal of the original file as disposal of its parsed/extracted contents.
