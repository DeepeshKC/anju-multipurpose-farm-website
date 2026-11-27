import { validateFeatured } from '../../../../_featured-image.js';

import {
  reply, guard, sameOrigin, safeJson
} from '../../../../_shared.js';
import { renderDocument } from '../articles.js';

function getId(ctx) {
  const id = Number(ctx.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function findArticle(db, id) {
  return db.prepare(`
    SELECT p.id, p.slug, p.title AS legacy_title,
      p.category, p.status, p.updated_at,
      en.id AS translation_id,
      en.title, en.excerpt, en.content_json,
      en.seo_title, en.seo_description,
      en.translation_status,
      en.source_version
    FROM posts p
    LEFT JOIN post_translations en
      ON en.post_id = p.id AND en.language = 'en'
    WHERE p.id = ?
  `).bind(id).first();
}

export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!ctx.env.DB) return reply({ error: 'Database unavailable' }, 503);

  const id = getId(ctx);
  if (!id) return reply({ error: 'Invalid article ID' }, 400);

  try {
    const article = await findArticle(ctx.env.DB, id);
    if (!article) return reply({ error: 'Article not found' }, 404);

    if (article.status !== 'draft') {
      return reply({ error: 'Only draft articles can be edited' }, 409);
    }
    if (!article.translation_id) {
      return reply({ error: 'English CMS translation missing' }, 409);
    }

    return reply({
      article: {
        ...article,
        content_json: JSON.parse(article.content_json)
      }
    });
  } catch (error) {
    console.error('CMS article retrieval failed', error);
    return reply({ error: 'Unable to load article' }, 500);
  }
}

export async function onRequestPut(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }
  if (!ctx.env.DB) return reply({ error: 'Database unavailable' }, 503);

  const id = getId(ctx);
  if (!id) return reply({ error: 'Invalid article ID' }, 400);

  const current = await findArticle(ctx.env.DB, id);
  if (!current) return reply({ error: 'Article not found' }, 404);
  if (current.status !== 'draft' || !current.translation_id) {
    return reply({ error: 'Only English CMS drafts can be edited' }, 409);
  }

  const data = await safeJson(ctx.request);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const {
    title, excerpt, category,
    seo_title, seo_description, content_json
  } = data;

  if (typeof title !== 'string' || !title.trim() || title.length > 150) {
    return reply({ error: 'Invalid title' }, 400);
  }

  for (const [key, value, max] of [
    ['excerpt', excerpt, 350],
    ['category', category, 60],
    ['seo_title', seo_title, 150],
    ['seo_description', seo_description, 350]
  ]) {
    if (typeof value !== 'string' || value.length > max) {
      return reply({ error: `Invalid ${key}` }, 400);
    }
  }

  if (!category.trim()) {
    return reply({ error: 'Category is required' }, 400);
  }

  let html;
  try {
    await validateFeatured(ctx.env.DB, content_json);
    html = renderDocument(content_json);
  } catch (error) {
    return reply({ error: error.message }, 400);
  }

  const json = JSON.stringify(content_json);
  if (json.length > 120000) {
    return reply({ error: 'TipTap JSON is too large' }, 400);
  }

  try {
    const results = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`
        UPDATE posts
        SET title=?, excerpt=?, content=?, category=?,
            updated_at=datetime('now')
        WHERE id=? AND status='draft'
      `).bind(title.trim(), excerpt, html, category.trim(), id),

      ctx.env.DB.prepare(`
        UPDATE post_translations
        SET title=?, excerpt=?, content_json=?, content_html=?,
            seo_title=?, seo_description=?,
            source_version=source_version+1,
            updated_at=datetime('now')
        WHERE post_id=? AND language='en'
          AND EXISTS (
            SELECT 1 FROM posts
            WHERE id=? AND status='draft'
          )
      `).bind(
        title.trim(), excerpt, json, html,
        seo_title, seo_description, id, id
      )
    ]);

    if (
      results[0].meta.changes !== 1 ||
      results[1].meta.changes !== 1
    ) {
      return reply({
        error: 'Draft update could not be completed'
      }, 409);
    }

    return reply({
      id,
      slug: current.slug,
      status: 'draft',
      language: 'en',
      updated: true,
      source_version: current.source_version + 1
    });
  } catch (error) {
    console.error('CMS draft update failed', error);
    return reply({ error: 'Unable to update draft' }, 500);
  }
}
