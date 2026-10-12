CREATE TABLE admin_approval_requests (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    session_id TEXT NOT NULL REFERENCES workspace_sessions(id),
    draft_id TEXT NOT NULL UNIQUE REFERENCES form_drafts(id),
    thread_id TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    review_revision INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    decided_at TEXT,
    decided_by TEXT,
    decision_note TEXT,
    result TEXT
);
CREATE INDEX admin_approval_requests_queue ON admin_approval_requests(tenant,status,created_at);
CREATE TABLE admin_approval_events (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL REFERENCES admin_approval_requests(id),
    kind TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
);
