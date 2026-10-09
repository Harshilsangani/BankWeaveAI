CREATE TABLE file_import_uploads(id TEXT PRIMARY KEY,owner TEXT NOT NULL,dataset TEXT NOT NULL,filename TEXT NOT NULL,format TEXT NOT NULL,source_hash TEXT NOT NULL,sheets TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE file_import_reviews(id TEXT PRIMARY KEY,upload_id TEXT NOT NULL,owner TEXT NOT NULL,entity TEXT NOT NULL,sheet TEXT NOT NULL,mapping TEXT NOT NULL,rows TEXT NOT NULL,errors TEXT NOT NULL,base_version TEXT NOT NULL,source_hash TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL,receipt TEXT);
CREATE INDEX file_import_owner ON file_import_uploads(owner,created_at DESC);
CREATE INDEX file_review_upload ON file_import_reviews(upload_id,created_at DESC);
CREATE TABLE record_import_sources(dataset TEXT NOT NULL,entity TEXT NOT NULL,record_id TEXT NOT NULL,review_id TEXT NOT NULL,PRIMARY KEY(dataset,entity,record_id));
