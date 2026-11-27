-- Batch 2 staging only: additive Cloudinary image registry and publication-safe associations.
CREATE TABLE IF NOT EXISTS cloudinary_media (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 public_id TEXT NOT NULL UNIQUE,
 secure_url TEXT NOT NULL,
 format TEXT NOT NULL,
 width INTEGER NOT NULL CHECK(width>0),
 height INTEGER NOT NULL CHECK(height>0),
 bytes INTEGER NOT NULL CHECK(bytes>0),
 alt_en TEXT NOT NULL DEFAULT '', alt_ne TEXT NOT NULL DEFAULT '',
 caption_en TEXT NOT NULL DEFAULT '', caption_ne TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cloudinary_article_media (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 media_id INTEGER NOT NULL REFERENCES cloudinary_media(id),
 role TEXT NOT NULL CHECK(role IN ('featured','inline')),
 position INTEGER NOT NULL DEFAULT 0,
 UNIQUE(post_id,media_id,role)
);
CREATE INDEX IF NOT EXISTS cloudinary_article_media_post ON cloudinary_article_media(post_id,role,position);
-- Immutable media snapshot: each published language revision receives its own associations.
CREATE TABLE IF NOT EXISTS cloudinary_publication_media (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 language TEXT NOT NULL CHECK(language IN ('en','ne')),
 publication_revision_id INTEGER NOT NULL,
 media_id INTEGER NOT NULL REFERENCES cloudinary_media(id),
 role TEXT NOT NULL CHECK(role IN ('featured','inline')),
 position INTEGER NOT NULL DEFAULT 0,
 UNIQUE(language,publication_revision_id,media_id,role)
);
CREATE INDEX IF NOT EXISTS cloudinary_publication_media_revision ON cloudinary_publication_media(language,publication_revision_id,position);
