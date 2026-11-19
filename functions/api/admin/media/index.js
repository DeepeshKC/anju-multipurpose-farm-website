import {reply,guard,sameOrigin} from '../../../_shared.js';
const cloudUrl=(cloud,id)=>`https://res.cloudinary.com/${cloud}/image/upload/${id}`;
export async function onRequestPost(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 let body;try{body=await ctx.request.json();}catch{return reply({error:'Invalid JSON'},400);}
 const {public_id,secure_url,format,width,height,bytes,alt_en='',alt_ne='',caption_en='',caption_ne=''}=body||{};
 if(typeof public_id!=='string'||!/^anju-farm\/staging\/[a-f0-9-]{36}$/.test(public_id)||typeof secure_url!=='string'||!secure_url.startsWith(`https://res.cloudinary.com/${ctx.env.CLOUDINARY_CLOUD_NAME}/image/upload/`)||!['jpg','jpeg','png','webp','avif'].includes(format)||![width,height,bytes].every(n=>Number.isSafeInteger(n)&&n>0)||bytes>10000000)return reply({error:'Invalid media'},400);
 for(const x of [alt_en,alt_ne,caption_en,caption_ne])if(typeof x!=='string'||x.length>500)return reply({error:'Invalid metadata'},400);
 // Cloudinary upload response must be verified using Cloudinary Admin API before registering.
 const auth=btoa(`${ctx.env.CLOUDINARY_API_KEY}:${ctx.env.CLOUDINARY_API_SECRET}`);
 const verify=await fetch(`https://api.cloudinary.com/v1_1/${ctx.env.CLOUDINARY_CLOUD_NAME}/resources/image/upload/${encodeURIComponent(public_id)}`,{headers:{Authorization:`Basic ${auth}`}});
 if(!verify.ok)return reply({error:'Cloudinary verification failed'},400);
 const actual=await verify.json();
 if(actual.public_id!==public_id||actual.secure_url!==secure_url||actual.bytes!==bytes||actual.width!==width||actual.height!==height)return reply({error:'Image details mismatch'},400);
 try{
 const result=await ctx.env.DB.prepare('INSERT INTO cloudinary_media(public_id,secure_url,format,width,height,bytes,alt_en,alt_ne,caption_en,caption_ne) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(public_id) DO UPDATE SET alt_en=excluded.alt_en,alt_ne=excluded.alt_ne,caption_en=excluded.caption_en,caption_ne=excluded.caption_ne RETURNING id').bind(public_id,secure_url,format,width,height,bytes,alt_en,alt_ne,caption_en,caption_ne).first();
 return reply({id:result.id,secure_url});
 }catch(e){console.error(e);return reply({error:'Media database unavailable or migration missing'},503);}
}
