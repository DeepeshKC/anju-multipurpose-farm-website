-- Apply once before deploying the code. Existing historical first dates are unknown unless independently verified.
ALTER TABLE post_translations ADD COLUMN first_published_at TEXT;
-- English snapshots are created at publication, unlike Nepali approval snapshots.
UPDATE post_translations SET first_published_at=(SELECT MIN(created_at) FROM english_publication_revisions r WHERE r.translation_id=post_translations.id) WHERE language='en' AND published_english_revision_id IS NOT NULL;
