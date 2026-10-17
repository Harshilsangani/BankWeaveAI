CREATE TABLE case_review_briefs (
    request_key TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL REFERENCES artifacts(id),
    tenant TEXT NOT NULL,
    created_by TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    artifact_hash TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running','ready','unavailable')),
    attempt_token TEXT NOT NULL,
    attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 3),
    lease_until REAL NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX case_review_brief_case ON case_review_briefs(investigation_id,tenant);
