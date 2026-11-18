
-- Track the current version of each English source.
-- Existing English translations begin at version 1.

ALTER TABLE post_translations
ADD COLUMN source_version INTEGER NOT NULL DEFAULT 1
CHECK (source_version >= 1);

-- Record the English source version used when
-- a Nepali revision was submitted for review.

ALTER TABLE translation_revisions
ADD COLUMN english_source_version INTEGER
CHECK (
  english_source_version IS NULL
  OR english_source_version >= 1
);
