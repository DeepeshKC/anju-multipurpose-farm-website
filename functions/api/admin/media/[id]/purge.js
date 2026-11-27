import {mediaFolder,ownsMedia} from '../../../../_media-environment.js';
import {reply,guard,sameOrigin} from '../../../../_shared.js';
const days=30;
export async function onRequestDelete(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid media ID'},400);
 const db=ctx.env.DB;
 try{
  const item=await db.prepare('SELECT m.public_id,m.secure_url,t.deleted_at FROM cloudinary_media m JOIN cloudinary_media_trash t ON t.media_id=m.id WHERE m.id=?').bind(id).first();
  if(!item)return reply({error:'Photograph not found in Trash'},404);
  const age=await db.prepare("SELECT CASE WHEN datetime(deleted_at) <= datetime('now','-30 days') THEN 1 ELSE 0 END AS eligible FROM cloudinary_media_trash WHERE media_id=?").bind(id).first();
  if(!age?.eligible)return reply({error:'Photographs must remain in Trash for 30 days before permanent deletion.'},409);
  for(const table of ['cloudinary_article_media','cloudinary_publication_media']){
   if(await db.prepare(`SELECT 1 FROM ${table} WHERE media_id=? LIMIT 1`).bind(id).first())return reply({error:'Photograph is referenced by an article or publication.'},409);
  }
  for(const [table,column] of [['posts','content'],['post_translations','content_json'],['post_translations','content_html'],['translation_revisions','content_json'],['translation_revisions','content_html'],['english_publication_revisions','content_json'],['english_publication_revisions','content_html']]){
   if(await db.prepare(`SELECT 1 FROM ${table} WHERE instr(COALESCE(${column},''),?)>0 OR instr(COALESCE(${column},''),?)>0 LIMIT 1`).bind(item.secure_url,`"mediaId":${id},`).first())return reply({error:'Photograph is referenced in article content or history.'},409);
  }
  const folder=mediaFolder(ctx.request,ctx.env);
  if(!folder)return reply({error:'Media environment mismatch'},503);
  if(!ownsMedia(folder,item.public_id))return reply({error:'Media belongs to another environment'},403);
  const cloud=ctx.env.CLOUDINARY_CLOUD_NAME,key=ctx.env.CLOUDINARY_API_KEY,secret=ctx.env.CLOUDINARY_API_SECRET;
  if(!cloud||!key||!secret)return reply({error:'Cloudinary credentials missing'},503);
  const timestamp=Math.floor(Date.now()/1000);
  const base=`public_id=${item.public_id}&timestamp=${timestamp}${secret}`;
  const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(base));
  const signature=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const body=new URLSearchParams({public_id:item.public_id,timestamp:String(timestamp),api_key:key,signature});
  const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`,{method:'POST',body});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!['ok','not found'].includes(result.result))return reply({error:'Cloudinary deletion failed; database record retained.'},502);
  await db.prepare('DELETE FROM cloudinary_media WHERE id=? AND EXISTS (SELECT 1 FROM cloudinary_media_trash WHERE media_id=?)').bind(id,id).run();
  return reply({ok:true});
 }catch(e){console.error('Permanent media deletion failed',e);return reply({error:'Could not complete deletion; check Cloudinary and D1 before retrying'},503);}
}
