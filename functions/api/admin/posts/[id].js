import { reply, guard, sameOrigin } from '../../../_shared.js';

// Legacy mutation endpoints retired. CMS-managed posts are handled only by
// the bilingual CMS APIs, which enforce editorial review and publication rules.
async function rejectLegacyMutation(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;
  if (!sameOrigin(ctx.request)) return reply({ error: 'Invalid origin' }, 403);
  return reply({ error: 'Legacy article modifications are disabled. Use the bilingual CMS.' }, 410);
}

export const onRequestPut = rejectLegacyMutation;
export const onRequestDelete = rejectLegacyMutation;
