CREATE TABLE IF NOT EXISTS operations(owner TEXT,request_id TEXT,fingerprint TEXT,status TEXT,result TEXT,created_at TEXT,PRIMARY KEY(owner,request_id));
