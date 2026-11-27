
import {
  reply,
  guard,
  sameOrigin,
  safeJson
} from '../../../../_shared.js';

import { renderDocument } from '../articles.js';

function articleId(ctx) {
  const id = Number(ctx.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function findArticle(db, id) {
  return db.prepare(`
    SELECT
      p.id,
      p.slug,
      p.status,
      en.id AS english_translation_id,
      en.updated_at AS english_updated_at,
      ne.id AS nepali_translation_id,
      ne.title,
      ne.excerpt,
      ne.content_json,
      ne.seo_title,
      ne.seo_description,
      ne.translation_status
    FROM posts p
    LEFT JOIN post_translations en
      ON en.post_id = p.id AND en.language = 'en'
    LEFT JOIN post_translations ne
      ON ne.post_id = p.id AND ne.language = 'ne'
    WHERE p.id = ?
  `).bind(id).first();
}

export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!ctx.env.DB) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const id = articleId(ctx);
  if (!id) return reply({ error: 'Invalid article ID' }, 400);

  try {
    const article = await findArticle(ctx.env.DB, id);

    if (!article || !article.english_translation_id) {
      return reply({ error: 'CMS article not found' }, 404);
    }

    if (article.status !== 'draft') {
      return reply({
        error: 'Only draft articles can be edited'
      }, 409);
    }

    return reply({
      article_id: id,
      slug: article.slug,
      language: 'ne',
      exists: Boolean(article.nepali_translation_id),
      translation: article.nepali_translation_id
        ? {
            id: article.nepali_translation_id,
            title: article.title,
            excerpt: article.excerpt,
            content_json: JSON.parse(article.content_json),
            seo_title: article.seo_title,
            seo_description: article.seo_description,
            translation_status: article.translation_status
          }
        : null
    });
  } catch (error) {
    console.error('Nepali translation loading failed', error);
    return reply({ error: 'Unable to load translation' }, 500);
  }
}

export async function onRequestPut(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }

  if (!ctx.env.DB) {
    return reply({ error: 'Database unavailable' }, 503);
  }

  const id = articleId(ctx);
  if (!id) return reply({ error: 'Invalid article ID' }, 400);

  const p = await safeJson(ctx.request);

  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const {
    title,
    excerpt = '',
    seo_title = '',
    seo_description = '',
    content_json
  } = p;

  if (
    typeof title !== 'string' ||
    !title.trim() ||
    title.length > 150
  ) {
    return reply({
      error: 'Nepali title must be 1–150 characters'
    }, 400);
  }

  for (const [key, value, max] of [
    ['excerpt', excerpt, 350],
    ['seo_title', seo_title, 150],
    ['seo_description', seo_description, 350]
  ]) {
    if (typeof value !== 'string' || value.length > max) {
      return reply({ error: `Invalid ${key}` }, 400);
    }
  }

  let html;

  try {
    html = renderDocument(content_json);
  } catch (error) {
    return reply({ error: error.message }, 400);
  }

  const json = JSON.stringify(content_json);

  if (json.length > 120000) {
    return reply({ error: 'TipTap JSON is too large' }, 400);
  }

  try {
    const article = await findArticle(ctx.env.DB, id);

    if (!article || !article.english_translation_id) {
      return reply({ error: 'CMS article not found' }, 404);
    }

    if (article.status !== 'draft') {
      return reply({
        error: 'Only draft articles can be edited'
      }, 409);
    }

    if (
      article.nepali_translation_id &&
      article.translation_status !== 'draft' &&
      article.translation_status !== 'changes_requested'
    ) {
      return reply({
        error: 'This translation cannot be edited in its current review status'
      }, 409);
    }

    const result = await ctx.env.DB.prepare(`
      INSERT INTO post_translations (
        post_id,
        language,
        title,
        excerpt,
        content_json,
        content_html,
        seo_title,
        seo_description,
        translation_status,
        source_english_updated_at
      )
      SELECT
        p.id,
        'ne',
        ?, ?, ?, ?, ?, ?,
        'draft',
        en.updated_at
      FROM posts p
      JOIN post_translations en
        ON en.post_id = p.id AND en.language = 'en'
      WHERE p.id = ?
        AND p.status = 'draft'
        AND (
          NOT EXISTS (
            SELECT 1
            FROM post_translations existing
            WHERE existing.post_id = p.id
              AND existing.language = 'ne'
          )
          OR EXISTS (
            SELECT 1
            FROM post_translations existing
            WHERE existing.post_id = p.id
              AND existing.language = 'ne'
              AND existing.translation_status IN (
                'draft',
                'changes_requested'
              )
          )
        )
      ON CONFLICT(post_id, language) DO UPDATE SET
        title = excluded.title,
        excerpt = excluded.excerpt,
        content_json = excluded.content_json,
        content_html = excluded.content_html,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        translation_status = 'draft',
        source_english_updated_at =
          excluded.source_english_updated_at,
        updated_at = datetime('now')
      WHERE post_translations.translation_status IN (
        'draft',
        'changes_requested'
      )
    `).bind(
      title.trim(),
      excerpt,
      json,
      html,
      seo_title,
      seo_description,
      id
    ).run();

    if (result.meta.changes !== 1) {
      return reply({
        error: 'Article is unavailable or translation is locked'
      }, 409);
    }

    return reply({
      article_id: id,
      language: 'ne',
      status: 'draft',
      saved: true
    });

  } catch (error) {
    console.error('Nepali translation saving failed', error);
    return reply({
      error: 'Unable to save Nepali translation'
    }, 500);
  }
}
