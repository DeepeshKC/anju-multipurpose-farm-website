import { reply, guard, sameOrigin, safeJson } from '../../../../../_shared.js';
export async function onRequestPost(ctx) {
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 const db=ctx.env.DB;if(!db)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<=0)return reply({error:'Invalid article ID'},400);
 const body=await safeJson(ctx.request);
 const action=body?.action;
 if(!['submit','approve','request_changes'].includes(action))return reply({error:'Invalid review action'},400);
 const notes=typeof body?.notes==='string'?body.notes.trim():'';
 if(notes.length>2000)return reply({error:'Review notes too long'},400);
 if(action==='request_changes'&&!notes)return reply({error:'Feedback required'},400);
 try {
  const t=await db.prepare(`SELECT en.id,en.source_version,p.status FROM posts p JOIN post_translations en ON en.post_id=p.id AND en.language='en' WHERE p.id=? AND NOT EXISTS (SELECT 1 FROM article_trash tr WHERE tr.post_id=p.id)`).bind(id).first();
  if(!t||t.status!=='draft')return reply({error:'Draft not found'},404);
  // Version is checked inside the INSERT so stale reviewer actions cannot approve edited content.
  const latest=await db.prepare(`SELECT decision FROM english_editorial_reviews WHERE translation_id=? AND source_version=? ORDER BY id DESC LIMIT 1`).bind(t.id,t.source_version).first();
  const status=latest?.decision||'draft';
  if((action==='submit'&& !['draft','changes_requested'].includes(status)) || (action!=='submit'&&status!=='submitted'))return reply({error:`Review action unavailable in ${status} state`},409);
  const decision=action==='submit'?'submitted':action==='approve'?'approved':'changes_requested';
  const result=await db.prepare(`INSERT INTO english_editorial_reviews(translation_id,source_version,decision,notes) SELECT id,source_version,?,? FROM post_translations WHERE id=? AND language='en' AND source_version=? AND EXISTS (SELECT 1 FROM posts WHERE id=post_translations.post_id AND status='draft') AND COALESCE((SELECT decision FROM english_editorial_reviews WHERE translation_id=post_translations.id AND source_version=post_translations.source_version ORDER BY id DESC LIMIT 1),'draft')=?`).bind(decision,notes,t.id,t.source_version,status).run();
  if(result.meta.changes!==1)return reply({error:'Article changed during review; refresh'},409);
  return reply({ok:true,article_id:id,language:'en',status:decision,source_version:t.source_version});
 }catch(e){console.error('English review error',e);return reply({error:'English review operation failed'},500)}
}
