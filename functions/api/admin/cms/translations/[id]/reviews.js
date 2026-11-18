
import {
  reply,
  guard
} from '../../../../../_shared.js';

function getId(ctx) {
  const id = Number(ctx.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  const db = ctx.env.DB;

  if (!db) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const articleId = getId(ctx);

  if (!articleId) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  try {
    const translation = await db.prepare(`
      SELECT
        p.id AS article_id,
        p.slug,
        p.status AS article_status,
        t.id AS translation_id,
        t.translation_status,
        t.approved_revision_id,
        t.published_revision_id
      FROM posts p
      JOIN post_translations t
        ON t.post_id = p.id
       AND t.language = 'ne'
      WHERE p.id = ?
    `).bind(articleId).first();

    if (!translation) {
      return reply({
        error: 'Nepali translation not found'
      }, 404);
    }

    const result = await db.prepare(`
      SELECT
        r.id AS revision_id,
        r.revision_number,
        r.title,
        r.excerpt,
        r.source_english_updated_at,
        r.created_by,
        r.created_at,
        review.id AS review_id,
        review.decision,
        review.reviewer_id,
        review.notes,
        review.reviewed_at
      FROM translation_revisions r
      LEFT JOIN translation_reviews review
        ON review.id = (
          SELECT latest_review.id
          FROM translation_reviews latest_review
          WHERE latest_review.revision_id = r.id
          ORDER BY
            latest_review.reviewed_at DESC,
            latest_review.id DESC
          LIMIT 1
        )
      WHERE r.translation_id = ?
      ORDER BY
        r.revision_number DESC,
        r.id DESC
    `).bind(translation.translation_id).all();

    const revisions = result.results || [];

    const currentRevision =
      translation.translation_status === 'in_review'
        ? revisions.find(revision => !revision.decision)
        : null;

    return reply({
      article_id: translation.article_id,
      slug: translation.slug,
      language: 'ne',
      article_status: translation.article_status,
      translation_status: translation.translation_status,
      approved_revision_id:
        translation.approved_revision_id,
      published_revision_id:
        translation.published_revision_id,
      current_revision_id:
        currentRevision?.revision_id ?? null,
      revisions: revisions.map(revision => ({
        revision_id: revision.revision_id,
        revision_number: revision.revision_number,
        title: revision.title,
        excerpt: revision.excerpt,
        source_english_updated_at:
          revision.source_english_updated_at,
        created_by: revision.created_by,
        created_at: revision.created_at,
        review: revision.review_id
          ? {
              id: revision.review_id,
              decision: revision.decision,
              reviewer_id: revision.reviewer_id,
              notes: revision.notes,
              reviewed_at: revision.reviewed_at
            }
          : null
      }))
    });

  } catch (error) {
    console.error(
      'Nepali review history retrieval failed',
      error
    );

    return reply({
      error: 'Unable to load review history'
    }, 500);
  }
}
