
import { reply } from '../_shared.js';

export async function onRequestGet({ env, request }) {
  if (!env.DB) {
    return reply({ error: 'Database not configured' }, 503);
  }

  const url = new URL(request.url);
  const language = url.searchParams.get('lang') || 'en';

  if (!['en', 'ne'].includes(language)) {
    return reply({ error: 'Unsupported language' }, 400);
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT
        p.slug,
        p.category,

        CASE
          WHEN ? = 'ne'
            AND ne.published_revision_id IS NOT NULL
            THEN nr.title
          ELSE er.title
        END AS title,

        CASE
          WHEN ? = 'ne'
            AND ne.published_revision_id IS NOT NULL
            THEN nr.excerpt
          ELSE er.excerpt
        END AS excerpt,

        CASE
          WHEN ? = 'ne'
            AND ne.published_revision_id IS NOT NULL
            THEN 'ne'
          ELSE 'en'
        END AS language,

        CASE
          WHEN ? = 'ne'
            AND ne.published_revision_id IS NULL
            THEN 1
          ELSE 0
        END AS fallback,

        en.language_published_at AS published_at

      FROM posts p

      JOIN post_translations en
        ON en.post_id = p.id
        AND en.language = 'en'

      JOIN english_publication_revisions er
        ON er.id = en.published_english_revision_id
        AND er.translation_id = en.id

      LEFT JOIN post_translations ne
        ON ne.post_id = p.id
        AND ne.language = 'ne'

      LEFT JOIN translation_revisions nr
        ON nr.id = ne.published_revision_id
        AND nr.translation_id = ne.id

      WHERE en.published_english_revision_id IS NOT NULL

      UNION ALL

      SELECT
        p.slug,
        p.category,
        p.title,
        p.excerpt,
        'en' AS language,
        CASE WHEN ? = 'ne' THEN 1 ELSE 0 END AS fallback,
        p.published_at

      FROM posts p

      WHERE p.status = 'published'
        AND NOT EXISTS (
          SELECT 1
          FROM post_translations en2
          WHERE en2.post_id = p.id
            AND en2.language = 'en'
        )

      ORDER BY published_at DESC
      LIMIT 100
    `).bind(
      language,
      language,
      language,
      language,
      language
    ).all();

    return reply({
      posts: (results || []).map(post => ({
        ...post,
        fallback: Boolean(post.fallback),
        requested_language: language
      }))
    });

  } catch (error) {
    console.error('Public bilingual blog listing failed', error);

    return reply({
      error: 'Unable to load published articles'
    }, 500);
  }
}
