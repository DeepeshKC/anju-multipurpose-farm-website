
import {
  reply,
  guard,
  sameOrigin,
  safeJson
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

  const articleId = getId(ctx);
  if (!articleId) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  const body = await safeJson(ctx.request);

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !Number.isSafeInteger(body.revision_id) ||
    body.revision_id <= 0
  ) {
    return reply({
      error: 'A valid revision_id is required'
    }, 400);
  }

  try {
    const revision = await db.prepare(`
      SELECT
        r.id AS revision_id,
        r.translation_id,
        r.revision_number,
        t.translation_status
      FROM translation_revisions r
      JOIN post_translations t
        ON t.id = r.translation_id
      JOIN posts p
        ON p.id = t.post_id
      WHERE p.id = ?
        AND p.status = 'draft'
        AND t.language = 'ne'
        AND r.id = ?
        AND t.translation_status = 'in_review'
        AND r.id = (
          SELECT MAX(latest.id)
          FROM translation_revisions latest
          WHERE latest.translation_id = t.id
        )
    `).bind(articleId, body.revision_id).first();

    if (!revision) {
      return reply({
        error: 'No matching revision awaiting approval'
      }, 409);
    }

    // D1 batch executes these statements transactionally.
    const results = await db.batch([
      db.prepare(`
        INSERT INTO translation_reviews (
          revision_id,
          decision,
          reviewer_id,
          notes
        )
        SELECT
          r.id,
          'approved',
          'admin',
          ''
        FROM translation_revisions r
        JOIN post_translations t
          ON t.id = r.translation_id
        JOIN posts p
          ON p.id = t.post_id
        WHERE r.id = ?
          AND p.id = ?
          AND p.status = 'draft'
          AND t.language = 'ne'
          AND t.translation_status = 'in_review'
          AND r.id = (
            SELECT MAX(latest.id)
            FROM translation_revisions latest
            WHERE latest.translation_id = t.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM translation_reviews existing
            WHERE existing.revision_id = r.id
          )
      `).bind(body.revision_id, articleId),

      db.prepare(`
        UPDATE post_translations
        SET
          translation_status = 'approved',
          approved_revision_id = ?,
          updated_at = datetime('now')
        WHERE id = ?
          AND language = 'ne'
          AND translation_status = 'in_review'
          AND EXISTS (
            SELECT 1
            FROM posts p
            WHERE p.id = post_translations.post_id
              AND p.id = ?
              AND p.status = 'draft'
          )
          AND EXISTS (
            SELECT 1
            FROM translation_reviews review
            WHERE review.revision_id = ?
              AND review.decision = 'approved'
          )
      `).bind(
        body.revision_id,
        revision.translation_id,
        articleId,
        body.revision_id
      )
    ]);

    if (
      results[0].meta.changes !== 1 ||
      results[1].meta.changes !== 1
    ) {
      return reply({
        error: 'Approval could not be completed'
      }, 409);
    }

    return reply({
      article_id: articleId,
      language: 'ne',
      translation_status: 'approved',
      approved_revision_id: body.revision_id,
      revision_number: revision.revision_number,
      approved: true
    });

  } catch (error) {
    console.error('Nepali approval failed', error);

    return reply({
      error: 'Unable to approve Nepali translation'
    }, 500);
  }
}
