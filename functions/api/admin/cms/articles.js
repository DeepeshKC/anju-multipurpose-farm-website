import { reply, guard } from '../../../_shared.js';

// Read-only CMS article overview. Existing legacy admin endpoints remain unchanged.
export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!ctx.env.DB) return reply({ error: 'Database binding missing' }, 503);
  try {
    const { results } = await ctx.env.DB.prepare(`
      SELECT p.id, p.slug, p.title AS legacy_title, p.category,
             p.status AS legacy_status, p.updated_at,
             en.id AS english_translation_id,
             en.title AS english_title,
             en.translation_status AS english_status,
             ne.id AS nepali_translation_id,
             ne.title AS nepali_title,
             ne.translation_status AS nepali_status,
             ne.approved_revision_id AS nepali_approved_revision_id,
             ne.published_revision_id AS nepali_published_revision_id
      FROM posts p
      LEFT JOIN post_translations en ON en.post_id = p.id AND en.language = 'en'
      LEFT JOIN post_translations ne ON ne.post_id = p.id AND ne.language = 'ne'
      ORDER BY p.updated_at DESC, p.id DESC
      LIMIT 100
    `).all();
    return reply({ articles: results ?? [], count: results?.length ?? 0 });
  } catch (error) {
    console.error('CMS article listing failed', error);
    return reply({ error: 'Unable to load CMS articles' }, 500);
  }
}
