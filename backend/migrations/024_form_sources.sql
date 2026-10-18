CREATE TABLE form_sources (
    draft_id TEXT PRIMARY KEY REFERENCES form_drafts(id),
    content BLOB NOT NULL CHECK(length(content) BETWEEN 1 AND 8388608),
    media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','image/png','image/jpeg')),
    sha256 TEXT NOT NULL
);
