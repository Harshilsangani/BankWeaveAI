CREATE TABLE kyc_cases(id TEXT PRIMARY KEY,customer_id TEXT,source_draft_id TEXT UNIQUE,owner TEXT,document_type TEXT,status TEXT,revision INTEGER,created_at TEXT);
CREATE TABLE kyc_events(id TEXT PRIMARY KEY,case_id TEXT,kind TEXT,reference TEXT,note TEXT,actor TEXT,created_at TEXT);
