import {reply,guard,sameOrigin} from '../../../_shared.js';
export async function onRequestPatch(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid media ID'},400);
 let data;try{data=await ctx.request.json();}catch{return reply({error:'Invalid JSON'},400);}
 const keys=['alt_en','alt_ne','caption_en','caption_ne'];
 if(!data||keys.some(k=>typeof data[k]!=='string'||data[k].length>500))return reply({error:'Invalid metadata'},400);
 try{const item=await ctx.env.DB.prepare('UPDATE cloudinary_media SET alt_en=?,alt_ne=?,caption_en=?,caption_ne=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM cloudinary_media_trash WHERE media_id=?) RETURNING id,secure_url,format,width,height,bytes,alt_en,alt_ne,caption_en,caption_ne,created_at').bind(...keys.map(k=>data[k].trim()),id,id).first();return item?reply({item}):reply({error:'Image not found'},404);}catch(e){console.error(e);return reply({error:'Could not save image details'},503);}
}

const validId=ctx=>{const id=Number(ctx.params.id);return Number.isSafeInteger(id)&&id>0?id:null;};
async function dependencies(db,item,id){
 for(const table of ['cloudinary_article_media','cloudinary_publication_media']){
  const used=await db.prepare(`SELECT 1 FROM ${table} WHERE media_id=? LIMIT 1`).bind(id).first();
  if(used)return 'This photograph is linked to an article or publication.';
 }
 for(const [table,column] of [['posts','content'],['post_translations','content_json'],['post_translations','content_html'],['translation_revisions','content_json'],['translation_revisions','content_html'],['english_publication_revisions','content_json'],['english_publication_revisions','content_html']]){
  const used=await db.prepare(`SELECT 1 FROM ${table} WHERE instr(COALESCE(${column},''),?)>0 OR instr(COALESCE(${column},''),?)>0 LIMIT 1`).bind(item.secure_url,`"mediaId":${id},`).first();
  if(used)return 'This photograph is referenced in saved article content or history.';
 }
 return null;
}
// DELETE now moves the photograph to Trash. No Cloudinary request is made.
export async function onRequestDelete(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=validId(ctx);if(!id)return reply({error:'Invalid media ID'},400);
 try{
  const item=await ctx.env.DB.prepare('SELECT id FROM cloudinary_media WHERE id=?').bind(id).first();
  if(!item)return reply({error:'Photograph not found'},404);
  const result=await ctx.env.DB.prepare("INSERT OR IGNORE INTO cloudinary_media_trash(media_id) VALUES(?)").bind(id).run();
  return reply({ok:true,trashed:true,already_trashed:!result.meta?.changes});
 }catch(e){console.error('Media trash failed',e);return reply({error:'Could not move photograph to Trash; verify migration 0007'},503);}
}
