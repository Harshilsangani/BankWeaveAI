CREATE TABLE campaign_reports (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES campaign_runs(id),
    tenant TEXT NOT NULL, owner TEXT NOT NULL, recipients TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, payload TEXT NOT NULL,
    content_hash TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK(review_status IN ('pending_review','reviewed','changes_requested','rejected')),
    review_revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE INDEX campaign_report_staff ON campaign_reports(tenant,owner,created_at);
CREATE TABLE campaign_review_events (
    id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES campaign_reports(id),
    revision INTEGER NOT NULL, content_hash TEXT NOT NULL, decision TEXT NOT NULL
    CHECK(decision IN ('reviewed','changes_requested','rejected')),
    actor_id TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(report_id,revision)
);
CREATE TABLE staff_notifications (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, recipient TEXT NOT NULL,
    report_id TEXT NOT NULL REFERENCES campaign_reports(id), type TEXT NOT NULL,
    title TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL,
    UNIQUE(recipient,report_id,type)
);
CREATE INDEX staff_notification_inbox ON staff_notifications(tenant,recipient,read_at,created_at);
