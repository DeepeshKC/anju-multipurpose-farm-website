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
