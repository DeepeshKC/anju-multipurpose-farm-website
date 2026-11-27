
import { reply } from '../../_shared.js';

export async function onRequestGet({ env, params, request }) {
  if (!env.DB) {
    return reply({ error: 'Database not configured' }, 503);
  }

  const url = new URL(request.url);
  const language = url.searchParams.get('lang') || 'en';

  if (!['en', 'ne'].includes(language)) {
    return reply({ error: 'Unsupported language' }, 400);
  }

  try {
    const cms = await env.DB.prepare(`
      SELECT
        p.slug,
        p.category,
        er.title AS english_title,
        er.excerpt AS english_excerpt,
        er.content_html AS english_content,
        er.content_json AS english_json, nr.content_json AS nepali_json,
        en.language_published_at AS published_at,
        nr.title AS nepali_title,
        nr.excerpt AS nepali_excerpt,
        nr.content_html AS nepali_content,
        (SELECT m.secure_url FROM cloudinary_publication_media pm JOIN cloudinary_media m ON m.id = pm.media_id WHERE pm.language = 'en' AND pm.publication_revision_id = er.id AND pm.role = 'featured' ORDER BY pm.position, pm.id LIMIT 1) AS english_image,
        (SELECT m.secure_url FROM cloudinary_publication_media pm JOIN cloudinary_media m ON m.id = pm.media_id WHERE pm.language = 'ne' AND pm.publication_revision_id = nr.id AND pm.role = 'featured' ORDER BY pm.position, pm.id LIMIT 1) AS nepali_image

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

      WHERE p.slug = ?
        AND en.published_english_revision_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM article_trash t WHERE t.post_id = p.id)
    `).bind(params.slug).first();

    if (cms) {
      const useNepali =
        language === 'ne' &&
        cms.nepali_title !== null &&
        cms.nepali_content !== null;

      const cover = JSON.parse((useNepali ? cms.nepali_json : cms.english_json) || "{}").featuredImage;
      return reply({
        post: {
          slug: cms.slug,
          category: cms.category,
          title: useNepali ? cms.nepali_title : cms.english_title,
          excerpt: useNepali ? cms.nepali_excerpt : cms.english_excerpt,
          content: useNepali ? cms.nepali_content : cms.english_content,
          content_format: 'html',
          language: useNepali ? 'ne' : 'en',
          requested_language: language,
          social_image: cover?.src || (useNepali ? cms.nepali_image : cms.english_image),
          featured_alt: (useNepali ? cover?.alt_ne : cover?.alt_en) || "",
          fallback: language === 'ne' && !useNepali,
          has_nepali_publication: cms.nepali_title !== null && cms.nepali_content !== null,
          published_at: cms.published_at
        }
      });
    }

    const legacy = await env.DB.prepare(`
      SELECT
        p.slug,
        p.title,
        p.excerpt,
        p.content,
        p.category,
        p.published_at

      FROM posts p

      WHERE p.slug = ?
        AND p.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM article_trash t WHERE t.post_id = p.id)
        AND NOT EXISTS (
          SELECT 1
          FROM post_translations en
          WHERE en.post_id = p.id
            AND en.language = 'en'
        )
    `).bind(params.slug).first();

    if (!legacy) {
      return reply({ error: 'Post not found' }, 404);
    }

    return reply({
      post: {
        ...legacy,
        content_format: 'text',
        language: 'en',
        requested_language: language,
        has_nepali_publication: false,
        fallback: language === 'ne'
      }
    });

  } catch (error) {
    console.error('Public article retrieval failed', error);

    return reply({
      error: 'Unable to load article'
    }, 500);
  }
}
