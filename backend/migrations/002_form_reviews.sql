CREATE TABLE IF NOT EXISTS form_quality(draft_id TEXT PRIMARY KEY,source_hash TEXT,provider TEXT,extracted_fields TEXT,provenance TEXT,revision INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS form_review_versions(draft_id TEXT,version INTEGER,fields TEXT,actor_id TEXT,reason TEXT,created_at TEXT,PRIMARY KEY(draft_id,version));
