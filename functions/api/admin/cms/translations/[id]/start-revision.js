import { reply, guard, sameOrigin } from '../../../../../_shared.js';

export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) return reply({ error: 'Invalid origin' }, 403);
  const db = ctx.env.DB;
  if (!db) return reply({ error: 'Database unavailable' }, 503);
  const id = Number(ctx.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return reply({ error: 'Invalid article ID' }, 400);
  try {
    const result = await db.prepare(`
      UPDATE post_translations
      SET translation_status = 'changes_requested', approved_revision_id = NULL,
          updated_at = datetime('now')
      WHERE post_id = ? AND language = 'ne' AND translation_status = 'approved'
        AND approved_revision_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM posts p WHERE p.id = post_translations.post_id AND p.status = 'draft')
        AND EXISTS (
          SELECT 1 FROM translation_revisions r
          JOIN post_translations en ON en.post_id = post_translations.post_id AND en.language = 'en'
          WHERE r.id = post_translations.approved_revision_id
            AND r.translation_id = post_translations.id
            AND (r.english_source_version IS NULL OR r.english_source_version <> en.source_version)
        )
    `).bind(id).run();
    if (result.meta.changes !== 1) return reply({ error: 'Only outdated approved Nepali translations can start a revision' }, 409);
    // Deliberately retain published_revision_id: published translation is immutable.
    return reply({ ok: true, article_id: id, translation_status: 'changes_requested' });
  } catch (error) {
    console.error('Nepali revision start failed', error);
    return reply({ error: 'Unable to start Nepali revision' }, 500);
  }
}
