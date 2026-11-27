-- Staging only. Soft deletion preserves Cloudinary asset and all metadata.
CREATE TABLE IF NOT EXISTS cloudinary_media_trash (
 media_id INTEGER PRIMARY KEY REFERENCES cloudinary_media(id) ON DELETE CASCADE,
 deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS cloudinary_media_trash_deleted_at ON cloudinary_media_trash(deleted_at DESC);
