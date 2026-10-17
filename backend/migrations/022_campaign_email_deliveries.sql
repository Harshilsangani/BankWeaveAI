CREATE TABLE campaign_email_deliveries (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL REFERENCES campaign_reports(id),
    run_id TEXT NOT NULL REFERENCES campaign_runs(id),
    customer_id TEXT NOT NULL, tenant TEXT NOT NULL, actor_id TEXT NOT NULL,
    report_hash TEXT NOT NULL, review_revision INTEGER NOT NULL,
    draft_hash TEXT NOT NULL, recipient TEXT NOT NULL, sender TEXT NOT NULL,
    subject TEXT NOT NULL, body TEXT NOT NULL, message_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('sending','accepted','failed','unknown')),
    attempt INTEGER NOT NULL DEFAULT 1, error TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(report_id,customer_id,recipient,draft_hash)
);
CREATE INDEX campaign_email_report ON campaign_email_deliveries(report_id,created_at);
