CREATE TABLE customer_preferences(dataset TEXT,customer_id TEXT,revision INTEGER,consent INTEGER,needs TEXT,min_cover_minor INTEGER,provenance TEXT,updated_at TEXT,PRIMARY KEY(dataset,customer_id));
CREATE TABLE recommendation_runs(id TEXT PRIMARY KEY,dataset TEXT,customer_id TEXT,input_hash TEXT,rules_version TEXT,payload TEXT,created_at TEXT,UNIQUE(dataset,customer_id,input_hash,rules_version));
CREATE TABLE recommendation_reviews(id TEXT PRIMARY KEY,status TEXT,note TEXT,actor TEXT,revision INTEGER,updated_at TEXT);
CREATE TABLE recommendation_events(id TEXT PRIMARY KEY,recommendation_id TEXT,status TEXT,note TEXT,actor TEXT,created_at TEXT);
