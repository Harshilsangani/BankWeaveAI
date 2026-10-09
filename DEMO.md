# Repeatable BankWeave demo and local evaluations

## Banking investigation

1. Command Center: historical September snapshot shows 20,000 transactions, 1,091 flagged transactions and 765 defaults; directory has 10,000 synthetic identities (original 1,200 IDs unchanged) plus any reviewed/manual profiles.
2. Manage customer data → open CUS-00001 → inspect linked products → Back to Command Center.
3. Open AI Analyst → “Why did fraud increase this month?” → 833 to 1,091.
4. “Only Ahmedabad” → 650 flags. “Compare it to Surat” → 858 across both regions.
5. Open investigation → browse evidence → run illustrative authentication scenario → create/download report.
6. Reload: conversation, scope, investigation and report references return from the local backend.
7. Ask “Why did loan defaults increase?” → 648 to 765. Explain that principal and default markers are synthetic proxies, not verified outstanding balances or loss.
8. Select BankShield → demonstrate historical USD analysis and explicit missing-relationship limitations. It cannot support loan or device-cluster investigations.

## Form onboarding

1. New analysis → attach `public/demo/customer-form.pdf` (fictional printed form).
2. Inspect Markdown and proposed fields; no customer is created on extraction.
3. Correct a field → wait for “Corrections saved” → reload and verify recovery.
   Missing/invalid fields show review reasons and available page provenance. If a possible existing customer appears, review the matches and record a duplicate decision/reason before confirmation. A single unambiguous match can be linked without overwriting that customer's profile.
4. Explicitly confirm → customer is saved with verification pending.
5. Reload: the saved ID returns and the add button disappears. This is neither KYC approval nor account opening.

## Permission demonstration

Settings → Local staff role → Viewer. Customer directory remains readable; editing is disabled. Direct create/edit/delete/confirm calls are also denied. Production rejects these development identities until real staff verification is integrated.

## Customer products and staff review

1. Ask **Show loan repayments and overdue evidence**: inspect dated installment IDs, due dates and principal-only assumptions. Ask **Show insurance coverage**: inspect expiry, recorded cover and nominee gaps.
2. Data Workspace → open a customer → inspect Repayments, Insurance, Financial health and Recommendations. Cashflow explicitly identifies generated income/opening observations and synthetic spending classifications.
3. In Recommendations, record fictional declared needs and consent with a reason. Inspect each rule's source facts and record a staff-review note. No customer contact or enrollment occurs.
4. Open a KYC review, attach fictional identity/address reference names and mark **Reviewed · verification pending**. This retains history without verifying identity or changing the profile to approved.
5. Record maintenance → create a synthetic account observation with confirmation/reason → reverse it with a reason → reload the retained receipt/history. Policy observations and principal-payment recording follow similarly constrained workflows; no real banking operation executes.
6. Open a Meridian fraud investigation → inspect a relationship node by mouse or keyboard. Every displayed edge uses a source key/reference; the bounded map describes observed correlation, not collusion. BankShield explicitly cannot provide this device map.

## Local evaluation commands

`npm run evaluate` executes versioned expected questions against an isolated seed and writes `artifacts/evaluation/local-results.json`. `npm run test:backend` covers source relationships, scope, canonical reports, OCR examples, corrupt/mixed PDFs, schema bounds, review interrupts/restarts, duplicate confirmations, misleading document instructions, provider contract failures and API/tool permissions. `npm run test:e2e` exercises both end-to-end UI flows, persistence, permissions and responsive layouts. `node scripts/python.mjs scripts/verify_recovery.py` verifies three-process recovery.

These tests validate local behavior and fake-provider contracts. Live Gemini routing/extraction quality, varied Indian forms, handwriting/regional languages, model outages and cloud latency must be measured again in G02/G03; local passing scores are not a live Gemini evaluation.
