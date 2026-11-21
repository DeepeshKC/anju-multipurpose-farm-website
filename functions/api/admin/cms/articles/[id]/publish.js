import { reply, guard, sameOrigin } from '../../../../../_shared.js';

// POST /api/admin/cms/articles/:id/publish
// Publish an immutable English snapshot without changing the editable draft.
export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) return reply({ error: 'Invalid origin' }, 403);
  if (!ctx.env.DB) return reply({ error: 'Database unavailable' }, 503);

  const id = Number(ctx.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  const db = ctx.env.DB;
  try {
    const article = await db.prepare(`
      SELECT p.id, p.status, en.id AS translation_id, en.source_version
      FROM posts p
      JOIN post_translations en ON en.post_id = p.id AND en.language = 'en'
      WHERE p.id = ?
    `).bind(id).first();

    if (!article) return reply({ error: 'English CMS article not found' }, 404);
    const approval = await db.prepare(`SELECT decision FROM english_editorial_reviews WHERE translation_id=? AND source_version=? ORDER BY id DESC LIMIT 1`).bind(article.translation_id,article.source_version).first();
    if(approval?.decision !== 'approved')return reply({error:'Current English revision must be approved before publication'},409);
    if (article.status !== 'draft') {
      return reply({ error: 'CMS article must retain legacy draft status' }, 409);
    }

    // D1 batch executes both statements transactionally. A concurrent draft
    // version change prevents the pointer update; any newly inserted snapshot
    // remains unpublished and cannot affect public content.
    const results = await db.batch([
      db.prepare(`
        INSERT OR IGNORE INTO english_publication_revisions
          (translation_id, source_version, title, excerpt, content_json,
           content_html, seo_title, seo_description)
        SELECT id, source_version, title, excerpt, content_json,
               content_html, seo_title, seo_description
        FROM post_translations
        WHERE id = ? AND language = 'en' AND source_version = ?
      `).bind(article.translation_id, article.source_version),
      db.prepare(`
        UPDATE post_translations
        SET published_english_revision_id = (
              SELECT r.id FROM english_publication_revisions r
              WHERE r.translation_id = post_translations.id
                AND r.source_version = ?
            ),
            language_published_at = CASE
              WHEN published_english_revision_id = (
                SELECT r.id FROM english_publication_revisions r
                WHERE r.translation_id = post_translations.id
                  AND r.source_version = ?
              ) AND language_published_at IS NOT NULL
              THEN language_published_at
              ELSE datetime('now')
            END
        WHERE id = ? AND language = 'en' AND source_version = ?
          AND EXISTS (
            SELECT 1 FROM posts p
            WHERE p.id = post_translations.post_id AND p.status = 'draft'
          )
          AND (SELECT decision FROM english_editorial_reviews review WHERE review.translation_id=post_translations.id AND review.source_version=post_translations.source_version ORDER BY review.id DESC LIMIT 1)='approved'
          AND EXISTS (
            SELECT 1 FROM english_publication_revisions r
            WHERE r.translation_id = post_translations.id
              AND r.source_version = ?
          )
      `).bind(
        article.source_version,
        article.source_version,
        article.translation_id,
        article.source_version,
        article.source_version
      )
    ]);

    if (results[1].meta.changes !== 1) {
      return reply({ error: 'Article changed during publication; retry' }, 409);
    }

    const published = await db.prepare(`
      SELECT r.id AS revision_id, r.source_version, t.language_published_at
      FROM post_translations t
      JOIN english_publication_revisions r
        ON r.id = t.published_english_revision_id AND r.translation_id = t.id
      WHERE t.id = ? AND t.language = 'en'
    `).bind(article.translation_id).first();

    if (!published || published.source_version !== article.source_version) {
      return reply({ error: 'Unable to confirm published revision; check status' }, 409);
    }

    return reply({ ok: true, article_id: id, language: 'en', published });
  } catch (error) {
    console.error('English CMS publication failed', error);
    return reply({ error: 'Unable to publish English article' }, 500);
  }
}
