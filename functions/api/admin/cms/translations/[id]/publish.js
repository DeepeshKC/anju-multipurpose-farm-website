import { reply, guard, sameOrigin } from '../../../../../_shared.js';

// POST /api/admin/cms/translations/:id/publish
// :id is the article (posts.id), not the translation revision ID.
export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) return reply({ error: 'Invalid origin' }, 403);
  const db = ctx.env.DB;
  if (!db) return reply({ error: 'Database unavailable' }, 503);

  const articleId = Number(ctx.params.id);
  if (!Number.isSafeInteger(articleId) || articleId <= 0) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  try {
    const candidate = await db.prepare(`
      SELECT ne.id AS translation_id, ne.approved_revision_id AS revision_id,
             ne.translation_status, r.english_source_version,
             en.source_version AS current_english_version,
             ne.published_revision_id
      FROM posts p
      JOIN post_translations ne ON ne.post_id = p.id AND ne.language = 'ne'
      JOIN post_translations en ON en.post_id = p.id AND en.language = 'en'
      LEFT JOIN translation_revisions r
        ON r.id = ne.approved_revision_id AND r.translation_id = ne.id
      WHERE p.id = ? AND p.status = 'draft'
    `).bind(articleId).first();

    if (!candidate) return reply({ error: 'Nepali CMS article not found' }, 404);
    if (candidate.translation_status !== 'approved' || !candidate.revision_id) {
      return reply({ error: 'Nepali revision is not approved' }, 409);
    }
    if (candidate.english_source_version == null ||
        candidate.english_source_version !== candidate.current_english_version) {
      return reply({ error: 'Approved Nepali revision requires English source revalidation' }, 409);
    }

    // Single conditional statement: eligibility is rechecked inside the UPDATE.
    // A prior published revision remains intact if the checks fail.
    const result = await db.prepare(`
      UPDATE post_translations
      SET published_revision_id = approved_revision_id,
          language_published_at = CASE
            WHEN published_revision_id = approved_revision_id
              AND language_published_at IS NOT NULL
            THEN language_published_at
            ELSE datetime('now')
          END
      WHERE id = ? AND post_id = ? AND language = 'ne'
        AND translation_status = 'approved'
        AND approved_revision_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM posts p
          WHERE p.id = post_translations.post_id AND p.status = 'draft'
        )
        AND EXISTS (
          SELECT 1
          FROM translation_revisions r
          JOIN post_translations en
            ON en.post_id = post_translations.post_id AND en.language = 'en'
          WHERE r.id = post_translations.approved_revision_id
            AND r.translation_id = post_translations.id
            AND r.english_source_version IS NOT NULL
            AND r.english_source_version = en.source_version
            AND EXISTS (
              SELECT 1 FROM translation_reviews review
              WHERE review.revision_id = r.id AND review.decision = 'approved'
            )
        )
    `).bind(candidate.translation_id, articleId).run();

    if (result.meta.changes !== 1) {
      return reply({ error: 'Publication eligibility changed; retry after review' }, 409);
    }

    const published = await db.prepare(`
      SELECT ne.published_revision_id AS revision_id,
             r.revision_number, r.english_source_version,
             ne.language_published_at
      FROM post_translations ne
      JOIN translation_revisions r
        ON r.id = ne.published_revision_id AND r.translation_id = ne.id
      WHERE ne.id = ? AND ne.language = 'ne'
    `).bind(candidate.translation_id).first();

    return reply({ ok: true, article_id: articleId, language: 'ne', published });
  } catch (error) {
    console.error('Nepali CMS publication failed:', error);
    return reply({ error: 'Unable to publish Nepali translation' }, 500);
  }
}
