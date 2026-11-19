-- Anju Farm CMS: publication snapshots (staging migration).
-- Apply only to D1 database anju-farm-blog-dev after review.
-- This migration does not publish any articles or alter existing approval history.

-- Immutable English publication snapshots. Draft edits remain in post_translations.
CREATE TABLE IF NOT EXISTS english_publication_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES post_translations(id) ON DELETE CASCADE,
  source_version INTEGER NOT NULL CHECK (source_version >= 1),
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL,
  content_html TEXT NOT NULL,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(translation_id, source_version)
);

CREATE INDEX IF NOT EXISTS english_publication_revisions_translation
  ON english_publication_revisions(translation_id, id DESC);

-- A pointer to the published English snapshot, not to the mutable draft.
ALTER TABLE post_translations
  ADD COLUMN published_english_revision_id INTEGER
  REFERENCES english_publication_revisions(id);

-- A language-specific publication timestamp; existing rows remain unpublished.
ALTER TABLE post_translations
  ADD COLUMN language_published_at TEXT;

-- Existing published_revision_id is reserved for published Nepali translation_revisions.
-- The publishing API must verify ownership, review approval, and source-version
-- consistency before updating any publication pointer. SQL columns alone do not
-- enforce those application-level rules.
