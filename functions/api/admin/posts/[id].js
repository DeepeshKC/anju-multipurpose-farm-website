
import {
  reply,
  guard,
  sameOrigin,
  safeJson,
  validatePost
} from '../../../_shared.js';

// Check whether the article exists and whether it is
// managed by the new bilingual CMS.
async function checkArticle(db, id) {
  return db.prepare(`
    SELECT
      p.id,
      EXISTS (
        SELECT 1
        FROM post_translations t
        WHERE t.post_id = p.id
      ) AS cms_managed
    FROM posts p
    WHERE p.id = ?
  `).bind(id).first();
}

// Update a legacy article.
export async function onRequestPut(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }

  if (!ctx.env.DB) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const id = Number(ctx.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  const article = await checkArticle(ctx.env.DB, id);

  if (!article) {
    return reply({ error: 'Article not found' }, 404);
  }

  if (article.cms_managed) {
    return reply({
      error: 'This article is managed by the new CMS and cannot be modified through the legacy API.'
    }, 409);
  }

  const post = await safeJson(ctx.request);
  const error = validatePost(post);

  if (error) {
    return reply({ error }, 400);
  }

  try {
    const result = await ctx.env.DB.prepare(`
      UPDATE posts
      SET
        slug = ?,
        title = ?,
        excerpt = ?,
        content = ?,
        category = ?,
        status = ?,
        updated_at = datetime('now'),
        published_at = CASE
          WHEN ? = 'published'
          THEN COALESCE(published_at, datetime('now'))
          ELSE NULL
        END
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM post_translations t
          WHERE t.post_id = posts.id
        )
    `).bind(
      post.slug,
      post.title.trim(),
      post.excerpt,
      post.content,
      post.category,
      post.status,
      post.status,
      id
    ).run();

    if (!result.meta.changes) {
      return reply({
        error: 'Article not found or managed by the new CMS'
      }, 409);
    }

    return reply({ ok: true });

  } catch (error) {
    console.error('Legacy article update failed:', error);

    return reply({
      error: 'Slug already exists or database error'
    }, 409);
  }
}

// Delete a legacy article.
export async function onRequestDelete(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }

  if (!ctx.env.DB) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const id = Number(ctx.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply({ error: 'Invalid article ID' }, 400);
  }

  const article = await checkArticle(ctx.env.DB, id);

  if (!article) {
    return reply({ error: 'Article not found' }, 404);
  }

  if (article.cms_managed) {
    return reply({
      error: 'CMS-managed articles cannot be deleted through the legacy API.'
    }, 409);
  }

  try {
    const result = await ctx.env.DB.prepare(`
      DELETE FROM posts
      WHERE id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM post_translations t
          WHERE t.post_id = posts.id
        )
    `).bind(id).run();

    if (!result.meta.changes) {
      return reply({
        error: 'Article not found or managed by the new CMS'
      }, 409);
    }

    return reply({ ok: true });

  } catch (error) {
    console.error('Legacy article deletion failed:', error);

    return reply({
      error: 'Unable to delete legacy article'
    }, 500);
  }
}
