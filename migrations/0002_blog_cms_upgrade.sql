-- Anju Farm CMS Phase 2: additive migration for D1 (SQLite).
-- Apply ONLY to anju-farm-blog-dev after reviewing. Keep legacy posts columns intact.
-- Translation approval and publication are enforced in the API, not by these tables alone.

CREATE TABLE IF NOT EXISTS post_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'ne')),
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  content_html TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (translation_status IN ('draft', 'ai_draft', 'in_review', 'changes_requested', 'approved')),
  published_revision_id INTEGER,
  approved_revision_id INTEGER,
  source_english_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, language)
);
CREATE INDEX IF NOT EXISTS post_translations_post_lang ON post_translations(post_id, language);

CREATE TABLE IF NOT EXISTS translation_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES post_translations(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{}',
  content_html TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  source_english_updated_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(translation_id, revision_number)
);
CREATE INDEX IF NOT EXISTS translation_revisions_translation ON translation_revisions(translation_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS translation_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL REFERENCES translation_revisions(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  reviewer_id TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS translation_reviews_revision ON translation_reviews(revision_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ne TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  width INTEGER,
  height INTEGER,
  alt_en TEXT NOT NULL DEFAULT '',
  alt_ne TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Existing posts can keep working via legacy APIs until their translation data is migrated.
-- Featured media reference is kept separately to avoid rebuilding the existing posts table.
CREATE TABLE IF NOT EXISTS post_media (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  featured_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL
);
