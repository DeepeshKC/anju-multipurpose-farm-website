import {reply,guard,sameOrigin} from '../../../../_shared.js';
const valid=ctx=>{const n=Number(ctx.params.id);return Number.isSafeInteger(n)&&n>0?n:null};
async function prepare(ctx){const denied=await guard(ctx);if(denied)return denied;if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);if(!ctx.env.DB)return reply({error:'Database unavailable'},503);if(!valid(ctx))return reply({error:'Invalid article ID'},400);return null;}
export async function onRequestPost(ctx){
 const error=await prepare(ctx);if(error)return error;
 try{const row=await ctx.env.DB.prepare('SELECT id FROM posts WHERE id=?').bind(valid(ctx)).first();if(!row)return reply({error:'Article not found'},404);
 await ctx.env.DB.prepare('INSERT OR IGNORE INTO article_trash(post_id) VALUES(?)').bind(valid(ctx)).run();return reply({ok:true});}
 catch(e){console.error(e);return reply({error:'Unable to move article to trash'},503);}
}
export async function onRequestPatch(ctx){
 const error=await prepare(ctx);if(error)return error;
 try{const result=await ctx.env.DB.prepare('DELETE FROM article_trash WHERE post_id=?').bind(valid(ctx)).run();return result.meta.changes?reply({ok:true}):reply({error:'Article not in trash'},404);}
 catch(e){console.error(e);return reply({error:'Unable to restore article'},503);}
}
export async function onRequestDelete(ctx){
 const error=await prepare(ctx);if(error)return error;
 const db=ctx.env.DB,id=valid(ctx);
 try{
 const trashed=await db.prepare('SELECT post_id FROM article_trash WHERE post_id=?').bind(id).first();if(!trashed)return reply({error:'Move the article to trash first'},409);
 // Publication-media associations have no FK to the revision tables. Clear these before deletion.
 const translations=await db.prepare('SELECT id FROM post_translations WHERE post_id=?').bind(id).all();
 const ids=(translations.results||[]).map(x=>x.id);
 const statements=[
 db.prepare(`DELETE FROM cloudinary_publication_media WHERE language='en' AND publication_revision_id IN (SELECT e.id FROM english_publication_revisions e JOIN post_translations t ON t.id=e.translation_id WHERE t.post_id=?)`).bind(id),
 db.prepare(`DELETE FROM cloudinary_publication_media WHERE language='ne' AND publication_revision_id IN (SELECT r.id FROM translation_revisions r JOIN post_translations t ON t.id=r.translation_id WHERE t.post_id=?)`).bind(id),
 db.prepare('DELETE FROM posts WHERE id=? AND EXISTS (SELECT 1 FROM article_trash WHERE post_id=?)').bind(id,id)
 ];
 await db.batch(statements);return reply({ok:true});
 }catch(e){console.error(e);return reply({error:'Permanent deletion failed; article remains in trash if the transaction was rolled back'},503);}
}
