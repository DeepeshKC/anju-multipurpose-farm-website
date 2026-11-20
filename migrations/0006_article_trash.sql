-- Apply to staging D1 before deploying deletion endpoints.
CREATE TABLE IF NOT EXISTS article_trash (
 post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS article_trash_deleted_at ON article_trash(deleted_at DESC);
