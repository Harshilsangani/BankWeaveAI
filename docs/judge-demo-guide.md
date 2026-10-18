# Reviewer guide

**[Open BankWeave AI](https://35.253.137.87)** · [Source repository](https://github.com/Harshilsangani/BankWeaveAI)

No login, Google account or API key is required for the hosted demonstration. Use HTTPS without `:3000`. The server supplies its own Vertex integration, uses separate synthetic storage and disables real email delivery. The VM must remain running during review.

The Analyst/Admin/Viewer selector demonstrates permissions; it does not create individual staff accounts. This is a shared demo, so changes may be visible to other visitors. A cloned repository runs in local mode without cloud credentials; follow the [quick start](../README.md#quick-start).

## Suggested review

1. **Settings:** inspect the AI connection and select Analyst. The current hosted model is `gemini-3.5-flash-lite`; saved results carry their own execution receipts.
2. **AI Analyst:** ask “Why did fraud increase in September 2026 compared with August 2026?”, then “Only Ahmedabad”. Inspect the SQL-derived figures, chart, table and evidence. Try Research and export the resulting PDF.
3. **Investigations:** open a September signal in Risk Radar. Review source evidence, save a note, reopen the saved case and export its report. Resolving a case requires a conclusion note.
4. **Forms:** upload the [three-page synthetic application](../frontend/tests/fixtures/meridian-three-page-application.pdf), correct its extracted fields and submit for Admin approval. Download the original through its chat attachment card. Switch to Admin and use **Data Workspace → Approval requests** to record a decision. Approval creates a profile pending verification.
5. **Card Campaigns:** prepare the October 2026 employee report. Inspect product matches, eligibility reasons and saved email previews. Record an Admin review; email sending is disabled in the public demo.
6. **Knowledge and data:** search “odd transfers” or “know your customer”, open the exact versioned section, and browse customer/source records. Admin can preview a synthetic import using the [banking template](../frontend/public/demo/banking-import-template.xlsx).
7. **Viewer:** switch to Viewer to inspect read access and unavailable write actions.

## Review boundaries

The data is historical and synthetic. Risk signals need human review; the app does not execute payment restrictions, approve credit or complete KYC. Five-year history and missing BankShield relationships are not invented. Model fallbacks and source coverage gaps are shown explicitly.

See [architecture](architecture.md) for request boundaries, ownership and calculation rules, [the roadmap](roadmap.md) for production work, and [deployment](deployment.md) for host maintenance. Never reset the original workspace to prepare a review.
