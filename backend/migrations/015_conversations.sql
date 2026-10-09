CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES workspace_sessions(id),
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX conversations_session_updated ON conversations(session_id, updated_at DESC);
