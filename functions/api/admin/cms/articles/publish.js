import { reply, guard, sameOrigin } from '../../../../../_shared.js';

// POST /api/admin/cms/articles/:id/publish
// Publishes an immutable English snapshot; does not change legacy posts.status.
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
    if (article.status !== 'draft') {
      return reply({ error: 'CMS article must retain legacy draft status' }, 409);
    }

    // Both statements run in a D1 batch transaction. The INSERT copies the
    // current draft, while the UPDATE resolves that same source version.
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
            language_published_at = datetime('now')
        WHERE id = ? AND language = 'en' AND source_version = ?
          AND EXISTS (
            SELECT 1 FROM posts p
            WHERE p.id = post_translations.post_id AND p.status = 'draft'
          )
          AND EXISTS (
            SELECT 1 FROM english_publication_revisions r
            WHERE r.translation_id = post_translations.id
              AND r.source_version = ?
          )
      `).bind(
        article.source_version, article.translation_id,
        article.source_version, article.source_version
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

    return reply({ ok: true, article_id: id, language: 'en', published });
  } catch (error) {
    console.error('English CMS publication failed', error);
    return reply({ error: 'Unable to publish English article' }, 500);
  }
}
