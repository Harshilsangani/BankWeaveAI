CREATE TABLE report_files(report_id TEXT PRIMARY KEY,html TEXT NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE report_downloads(id TEXT PRIMARY KEY,report_id TEXT,actor TEXT,sha256 TEXT,created_at TEXT);
