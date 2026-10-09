CREATE TABLE policy_documents(id TEXT,version TEXT,title TEXT,category TEXT,summary TEXT,markdown TEXT,sha256 TEXT,created_at TEXT,actor TEXT,PRIMARY KEY(id,version));
CREATE TABLE policy_chunks(reference TEXT PRIMARY KEY,document_id TEXT,version TEXT,section TEXT,ordinal INTEGER,text TEXT);
CREATE INDEX policy_chunk_document ON policy_chunks(document_id,version);
