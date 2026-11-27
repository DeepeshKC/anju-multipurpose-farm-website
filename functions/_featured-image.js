// Store validated media metadata in the same immutable JSON snapshot as the article.
export async function validateFeatured(db, doc) {
  if (!doc || typeof doc !== 'object') throw new Error('Invalid document');
  const id = doc.featuredImage?.mediaId;
  delete doc.featuredImage;
  if (id == null) return;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid featured image');
  const m = await db.prepare(`SELECT id, secure_url, alt_en, alt_ne FROM cloudinary_media WHERE id=? AND NOT EXISTS (SELECT 1 FROM cloudinary_media_trash WHERE media_id=?)`).bind(id,id).first();
  if (!m || !/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(m.secure_url)) throw new Error('Featured image unavailable; select another photograph');
  doc.featuredImage={mediaId:m.id,src:m.secure_url,alt_en:m.alt_en,alt_ne:m.alt_ne};
}
