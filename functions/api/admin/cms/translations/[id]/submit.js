
import {
  reply,
  guard,
  sameOrigin
} from '../../../../../_shared.js';

function getId(ctx) {
  const id = Number(ctx.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }

  const db = ctx.env.DB;

  if (!db) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const id = getId(ctx);

  if (!id) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  try {
    const translation = await db.prepare(`
      SELECT
        ne.id,
        ne.post_id,
        ne.title,
        ne.excerpt,
        ne.content_json,
        ne.content_html,
        ne.seo_title,
        ne.seo_description,
        ne.source_english_updated_at,
        ne.translation_status
      FROM post_translations ne
      JOIN posts p ON p.id = ne.post_id
      JOIN post_translations en
        ON en.post_id = p.id AND en.language = 'en'
      WHERE ne.post_id = ?
        AND ne.language = 'ne'
        AND p.status = 'draft'
    `).bind(id).first();

    if (!translation) {
      return reply({
        error: 'Nepali draft not found'
      }, 404);
    }

    if (!['draft', 'changes_requested'].includes(
      translation.translation_status
    )) {
      return reply({
        error: 'Translation cannot be submitted in its current status'
      }, 409);
    }

    if (!translation.title.trim()) {
      return reply({
        error: 'Nepali translation title is required'
      }, 400);
    }

    const result = await db.batch([
      db.prepare(`
        INSERT INTO translation_revisions (
          translation_id,
          revision_number,
          title,
          excerpt,
          content_json,
          content_html,
          seo_title,
          seo_description,
          source_english_updated_at,
          created_by
        )
        SELECT
          t.id,
          COALESCE((
            SELECT MAX(r.revision_number) + 1
            FROM translation_revisions r
            WHERE r.translation_id = t.id
          ), 1),
          t.title,
          t.excerpt,
          t.content_json,
          t.content_html,
          t.seo_title,
          t.seo_description,
          t.source_english_updated_at,
          'admin'
        FROM post_translations t
        JOIN posts p ON p.id = t.post_id
        WHERE t.id = ?
          AND p.status = 'draft'
          AND t.translation_status IN (
            'draft',
            'changes_requested'
          )
      `).bind(translation.id),

      db.prepare(`
        UPDATE post_translations
        SET
          translation_status = 'in_review',
          updated_at = datetime('now')
        WHERE id = ?
          AND translation_status IN (
            'draft',
            'changes_requested'
          )
          AND EXISTS (
            SELECT 1 FROM posts p
            WHERE p.id = post_translations.post_id
              AND p.status = 'draft'
          )
      `).bind(translation.id)
    ]);

    if (
      result[0].meta.changes !== 1 ||
      result[1].meta.changes !== 1
    ) {
      return reply({
        error: 'Translation submission could not be completed'
      }, 409);
    }

    const revision = await db.prepare(`
      SELECT id, revision_number
      FROM translation_revisions
      WHERE translation_id = ?
      ORDER BY revision_number DESC
      LIMIT 1
    `).bind(translation.id).first();

    return reply({
      article_id: id,
      language: 'ne',
      translation_status: 'in_review',
      revision_id: revision.id,
      revision_number: revision.revision_number,
      submitted: true
    });

  } catch (error) {
    console.error('Nepali review submission failed:', error);

    return reply({
      error: 'Unable to submit Nepali translation'
    }, 500);
  }
}
