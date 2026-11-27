-- Apply to staging D1 only, once, before deploying application code.
CREATE TABLE IF NOT EXISTS english_editorial_reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 translation_id INTEGER NOT NULL REFERENCES post_translations(id) ON DELETE CASCADE,
 source_version INTEGER NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('submitted','approved','changes_requested')),
 reviewer_id TEXT NOT NULL DEFAULT 'admin',
 notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_english_editorial_review ON english_editorial_reviews(translation_id,source_version,id DESC);
