CREATE TABLE IF NOT EXISTS investigation_cases(investigation_id TEXT PRIMARY KEY,owner TEXT,status TEXT,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS case_events(id TEXT PRIMARY KEY,investigation_id TEXT,actor_id TEXT,kind TEXT,note TEXT,source_scope TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS risk_dispositions(workspace TEXT,dataset TEXT,period TEXT,risk_id TEXT,dismissed INTEGER,actor_id TEXT,updated_at TEXT,PRIMARY KEY(workspace,dataset,period,risk_id));
