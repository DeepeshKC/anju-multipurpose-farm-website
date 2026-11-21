import { reply, guard, sameOrigin } from '../../../_shared.js';

// Legacy read endpoint retained for compatibility with existing admin views.
export async function onRequestGet(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!ctx.env.DB) return reply({ error: 'Database unavailable' }, 503);
  const { results } = await ctx.env.DB.prepare(
    'SELECT * FROM posts ORDER BY updated_at DESC LIMIT 200'
  ).all();
  return reply({ posts: results });
}

// All new articles must use the bilingual CMS editorial workflow.
export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) return reply({ error: 'Invalid origin' }, 403);
  return reply({ error: 'Legacy article creation is disabled. Use the bilingual CMS.' }, 410);
}
