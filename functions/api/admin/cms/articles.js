
import { reply, guard, sameOrigin, safeJson } from '../../../_shared.js';

// Read-only CMS article overview.
// Existing legacy admin endpoints remain unchanged.
export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!ctx.env.DB) {
    return reply({ error: 'Database binding missing' }, 503);
  }

  try {
    const { results } = await ctx.env.DB.prepare(`
      SELECT
        p.id,
        p.slug,
        p.title AS legacy_title,
        p.category,
        p.status AS legacy_status,
        p.updated_at,

        en.id AS english_translation_id,
        en.title AS english_title,
        en.translation_status AS english_status,
        en.source_version AS english_source_version,

        ne.id AS nepali_translation_id,
        ne.title AS nepali_title,
        ne.translation_status AS nepali_status,
        ne.approved_revision_id AS nepali_approved_revision_id,
        ne.published_revision_id AS nepali_published_revision_id,

        approved.english_source_version
          AS nepali_approved_source_version,

        CASE
          WHEN ne.id IS NULL THEN 'not_started'

          WHEN ne.translation_status = 'in_review'
            THEN 'pending_review'

          WHEN ne.approved_revision_id IS NULL
            THEN 'not_approved'

          WHEN approved.id IS NULL
            THEN 'unverified'

          WHEN approved.english_source_version IS NULL
            THEN 'unverified'

          WHEN en.id IS NULL
            THEN 'unverified'

          WHEN approved.english_source_version = en.source_version
            THEN 'current'

          ELSE 'outdated'
        END AS nepali_source_status

      FROM posts p

      LEFT JOIN post_translations en
        ON en.post_id = p.id
        AND en.language = 'en'

      LEFT JOIN post_translations ne
        ON ne.post_id = p.id
        AND ne.language = 'ne'

      LEFT JOIN translation_revisions approved
        ON approved.id = ne.approved_revision_id
        AND approved.translation_id = ne.id

      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT 100
    `).all();

    return reply({
      articles: results ?? [],
      count: results?.length ?? 0
    });

  } catch (error) {
    console.error('CMS article listing failed', error);

    return reply({
      error: 'Unable to load CMS articles'
    }, 500);
  }
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[ch]));

const allowedMarks = new Set([
  'bold', 'italic', 'strike', 'code', 'underline'
]);

const markTags = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  code: 'code',
  underline: 'u'
};

const allowedNodes = new Set([
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'hardBreak',
  'horizontalRule'
]);

export function renderDocument(doc) {
  let nodes = 0;
  let textLength = 0;

  function render(node, depth = 0) {
    if (
      !node ||
      typeof node !== 'object' ||
      Array.isArray(node) ||
      depth > 32 ||
      ++nodes > 3000 ||
      !allowedNodes.has(node.type)
    ) {
      throw new Error('Unsupported or oversized TipTap document');
    }

    const attrs = node.attrs ?? {};

    if (
      typeof attrs !== 'object' ||
      attrs === null ||
      Array.isArray(attrs)
    ) {
      throw new Error('Invalid node attributes');
    }

    if (node.type === 'text') {
      if (typeof node.text !== 'string') {
        throw new Error('Invalid text node');
      }

      textLength += node.text.length;

      if (textLength > 30000) {
        throw new Error('Article content exceeds 30000 characters');
      }

      let html = escapeHtml(node.text);

      if (
        node.marks !== undefined &&
        !Array.isArray(node.marks)
      ) {
        throw new Error('Invalid marks');
      }

      for (const mark of node.marks ?? []) {
        if (
          !mark ||
          typeof mark !== 'object' ||
          !allowedMarks.has(mark.type)
        ) {
          throw new Error('Unsupported text formatting');
        }

        const tag = markTags[mark.type];
        html = `<${tag}>${html}</${tag}>`;
      }

      return html;
    }

    if (node.marks !== undefined) {
      throw new Error('Marks are only allowed on text nodes');
    }

    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'horizontalRule') return '<hr>';

    if (!Array.isArray(node.content)) {
      throw new Error('Invalid TipTap content');
    }

    const children = node.content
      .map(child => render(child, depth + 1))
      .join('');

    switch (node.type) {
      case 'doc':
        return children;

      case 'paragraph':
        return `<p>${children}</p>`;

      case 'heading': {
        const level = attrs.level;

        if (
          !Number.isInteger(level) ||
          level < 2 ||
          level > 4
        ) {
          throw new Error('Heading levels must be 2–4');
        }

        return `<h${level}>${children}</h${level}>`;
      }

      case 'bulletList':
        return `<ul>${children}</ul>`;

      case 'orderedList':
        return `<ol>${children}</ol>`;

      case 'listItem':
        return `<li>${children}</li>`;

      case 'blockquote':
        return `<blockquote>${children}</blockquote>`;

      default:
        throw new Error('Unsupported node');
    }
  }

  if (
    !doc ||
    doc.type !== 'doc' ||
    !Array.isArray(doc.content)
  ) {
    throw new Error(
      'TipTap root must be a doc with content'
    );
  }

  const html = render(doc);

  if (!textLength) {
    throw new Error('Article content cannot be empty');
  }

  return html;
}

export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request)) {
    return reply({ error: 'Invalid origin' }, 403);
  }

  if (!ctx.env.DB) {
    return reply({ error: 'Database binding missing' }, 503);
  }

  const p = await safeJson(ctx.request);

  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p)
  ) {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const {
    title,
    slug,
    excerpt = '',
    category = 'FARM STORIES',
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
      error: 'Title must be 1–150 characters'
    }, 400);
  }

  if (
    typeof slug !== 'string' ||
    slug.length > 100 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  ) {
    return reply({ error: 'Invalid slug' }, 400);
  }

  for (const [key, value, max] of [
    ['excerpt', excerpt, 350],
    ['category', category, 60],
    ['seo_title', seo_title, 150],
    ['seo_description', seo_description, 350]
  ]) {
    if (
      typeof value !== 'string' ||
      value.length > max
    ) {
      return reply({
        error: `Invalid ${key}`
      }, 400);
    }
  }

  if (!category.trim()) {
    return reply({
      error: 'Category is required'
    }, 400);
  }

  let html;

  try {
    html = renderDocument(content_json);
  } catch (e) {
    return reply({ error: e.message }, 400);
  }

  const json = JSON.stringify(content_json);

  if (json.length > 120000) {
    return reply({
      error: 'TipTap JSON is too large'
    }, 400);
  }

  try {
    const exists = await ctx.env.DB.prepare(
      'SELECT id FROM posts WHERE slug = ?'
    ).bind(slug).first();

    if (exists) {
      return reply({
        error: 'Slug already exists'
      }, 409);
    }

    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`
        INSERT INTO posts (
          slug,
          title,
          excerpt,
          content,
          category,
          status
        )
        VALUES (?, ?, ?, ?, ?, 'draft')
      `).bind(
        slug,
        title.trim(),
        excerpt,
        html,
        category.trim()
      ),

      ctx.env.DB.prepare(`
        INSERT INTO post_translations (
          post_id,
          language,
          title,
          excerpt,
          content_json,
          content_html,
          seo_title,
          seo_description,
          translation_status
        )
        SELECT
          id,
          'en',
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          'draft'
        FROM posts
        WHERE slug = ?
      `).bind(
        title.trim(),
        excerpt,
        json,
        html,
        seo_title,
        seo_description,
        slug
      )
    ]);

    const created = await ctx.env.DB.prepare(
      'SELECT id FROM posts WHERE slug = ?'
    ).bind(slug).first();

    return reply({
      id: created.id,
      slug,
      status: 'draft',
      language: 'en'
    }, 201);

  } catch (error) {
    console.error('CMS draft creation failed', error);

    return reply({
      error: 'Unable to create draft (check slug and database)'
    }, 409);
  }
}
