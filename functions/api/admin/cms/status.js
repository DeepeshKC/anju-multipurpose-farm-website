import { reply, guard } from '../../../_shared.js';

// Read-only CMS schema readiness check. Requires an authenticated admin session.
export async function onRequestGet(context) {
  const denied = await guard(context);
  if (denied) return denied;
  if (!context.env.DB) return reply({ error: 'D1 binding DB is missing' }, 503);

  try {
    const { results } = await context.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('posts','post_translations','translation_revisions','translation_reviews','tags','post_tags','media','post_media') ORDER BY name"
    ).all();
    const expected = ['posts', 'post_translations', 'translation_revisions', 'translation_reviews', 'tags', 'post_tags', 'media', 'post_media'];
    const found = new Set(results.map(row => row.name));
    const missing = expected.filter(name => !found.has(name));
    return reply({ ready: missing.length === 0, missing, tableCount: results.length }, missing.length ? 503 : 200);
  } catch (error) {
    return reply({ error: 'Unable to verify CMS schema' }, 500);
  }
}
