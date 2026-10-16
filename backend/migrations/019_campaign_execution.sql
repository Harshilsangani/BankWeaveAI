CREATE TABLE campaign_features (
    batch_id TEXT NOT NULL REFERENCES campaign_input_batches(id), customer_id TEXT NOT NULL,
    cutoff TEXT NOT NULL, payload TEXT NOT NULL, input_hash TEXT NOT NULL,
    PRIMARY KEY(batch_id,customer_id,cutoff)
);
CREATE TABLE card_campaigns (
    id TEXT PRIMARY KEY, tenant TEXT NOT NULL, owner TEXT NOT NULL,
    title TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
    configuration TEXT NOT NULL, recipients TEXT NOT NULL, created_at TEXT NOT NULL,
    schedule_enabled INTEGER NOT NULL DEFAULT 0 CHECK(schedule_enabled IN (0,1)),
    schedule_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    schedule_last_period TEXT
);
CREATE INDEX campaign_staff ON card_campaigns(tenant,owner,created_at);
CREATE TABLE campaign_runs (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES card_campaigns(id),
    tenant TEXT NOT NULL, owner TEXT NOT NULL, request_id TEXT NOT NULL,
    fingerprint TEXT NOT NULL, campaign_revision INTEGER NOT NULL, period TEXT NOT NULL,
    batch_id TEXT NOT NULL REFERENCES campaign_input_batches(id), specification TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('queued','validating','building_features','matching','drafting','reporting','ready','failed','cancelled')),
    checkpoint TEXT NOT NULL DEFAULT '{}', attempt INTEGER NOT NULL DEFAULT 0,
    lease_owner TEXT, lease_until TEXT, heartbeat_at TEXT,
    cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
    warning TEXT, error TEXT, report_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(tenant,owner,request_id), UNIQUE(campaign_id,campaign_revision,period)
);
CREATE INDEX campaign_worker_queue ON campaign_runs(status,lease_until,created_at);
CREATE TABLE campaign_candidates (
    run_id TEXT NOT NULL REFERENCES campaign_runs(id), customer_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('prospect','no_match','insufficient_data')),
    reason_code TEXT NOT NULL, product_id TEXT, product_version TEXT,
    contact_status TEXT NOT NULL CHECK(contact_status IN ('allowed','suppressed','not_applicable')),
    contact_reason TEXT NOT NULL, evidence TEXT NOT NULL, PRIMARY KEY(run_id,customer_id)
);
CREATE INDEX campaign_candidate_status ON campaign_candidates(run_id,status,contact_status,customer_id);
CREATE TABLE campaign_drafts (
    run_id TEXT NOT NULL, customer_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    template_version TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
    content_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('validated','suppressed')),
    PRIMARY KEY(run_id,customer_id), FOREIGN KEY(run_id,customer_id) REFERENCES campaign_candidates(run_id,customer_id)
);
