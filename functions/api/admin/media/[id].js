import {reply,guard,sameOrigin} from '../../../_shared.js';
export async function onRequestPatch(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid media ID'},400);
 let data;try{data=await ctx.request.json();}catch{return reply({error:'Invalid JSON'},400);}
 const keys=['alt_en','alt_ne','caption_en','caption_ne'];
 if(!data||keys.some(k=>typeof data[k]!=='string'||data[k].length>500))return reply({error:'Invalid metadata'},400);
 try{const item=await ctx.env.DB.prepare('UPDATE cloudinary_media SET alt_en=?,alt_ne=?,caption_en=?,caption_ne=? WHERE id=? RETURNING id,secure_url,format,width,height,bytes,alt_en,alt_ne,caption_en,created_at').bind(...keys.map(k=>data[k].trim()),id).first();return item?reply({item}):reply({error:'Image not found'},404);}catch(e){console.error(e);return reply({error:'Could not save image details'},503);}
}

export async function onRequestDelete(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid media ID'},400);
 const db=ctx.env.DB;
 try{
  const item=await db.prepare('SELECT public_id,secure_url FROM cloudinary_media WHERE id=?').bind(id).first();
  if(!item)return reply({error:'Photograph not found'},404);
  const checks=[
   ['cloudinary_article_media','media_id'],['cloudinary_publication_media','media_id']
  ];
  for(const [table,column] of checks){const used=await db.prepare(`SELECT 1 AS used FROM ${table} WHERE ${column}=? LIMIT 1`).bind(id).first();if(used)return reply({error:'This photograph is linked to an article. Remove the image from the article and its published versions before deleting.'},409);}
  // Check all draft, published and historical content, including legacy HTML.
  for(const [table,column] of [['posts','content'],['post_translations','content_json'],['post_translations','content_html'],['translation_revisions','content_json'],['translation_revisions','content_html'],['english_publication_revisions','content_json'],['english_publication_revisions','content_html']]){
   const used=await db.prepare(`SELECT 1 AS used FROM ${table} WHERE instr(${column},?)>0 OR instr(${column},?)>0 LIMIT 1`).bind(item.secure_url,`"mediaId":${id}`).first();
   if(used)return reply({error:'This photograph appears in saved article content or history. Deletion is blocked.'},409);
  }
  const cloud=ctx.env.CLOUDINARY_CLOUD_NAME,key=ctx.env.CLOUDINARY_API_KEY,secret=ctx.env.CLOUDINARY_API_SECRET;
  if(!cloud||!key||!secret)return reply({error:'Cloudinary credentials missing'},503);
  if(!item.public_id.startsWith('anju-farm/staging/'))return reply({error:'Only staging uploads can be deleted'},403);
  const timestamp=Math.floor(Date.now()/1000);
  const signatureBase=`public_id=${item.public_id}&timestamp=${timestamp}${secret}`;
  const digest=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(signatureBase));
  const signature=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const body=new URLSearchParams({public_id:item.public_id,timestamp:String(timestamp),api_key:key,signature});
  const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`,{method:'POST',body});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!['ok','not found'].includes(result.result))return reply({error:'Cloudinary could not delete the image. Nothing was removed from the library.'},502);
  await db.prepare('DELETE FROM cloudinary_media WHERE id=?').bind(id).run();
  return reply({ok:true});
 }catch(e){console.error('Media deletion failed',e);return reply({error:'Could not delete image; verify Cloudinary and database state before retrying'},503);}
}
