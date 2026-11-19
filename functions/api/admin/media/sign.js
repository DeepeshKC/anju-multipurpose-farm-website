import {reply,guard,sameOrigin} from '../../../_shared.js';
const validName = name => typeof name==='string' && /^[a-zA-Z0-9._-]{1,120}$/.test(name);
const allowed = new Set(['image/jpeg','image/png','image/webp','image/avif']);
function hex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function onRequestPost(ctx){
 const denied=await guard(ctx); if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 const {CLOUDINARY_CLOUD_NAME:cloud,CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret}=ctx.env;
 if(!cloud||!key||!secret)return reply({error:'Cloudinary is not configured'},503);
 let data;try{data=await ctx.request.json();}catch{return reply({error:'Invalid request'},400);}
 if(!validName(data?.filename)||!allowed.has(data?.mime_type)||!Number.isSafeInteger(data?.size)||data.size<1||data.size>10000000)return reply({error:'Use JPEG, PNG, WebP or AVIF images up to 10 MB'},400);
 const timestamp=Math.floor(Date.now()/1000);
 const folder='anju-farm/staging';
 const public_id=crypto.randomUUID();
 const params=`folder=${folder}&public_id=${public_id}&timestamp=${timestamp}`;
 const payload=new TextEncoder().encode(params+secret);
 const signature=hex(await crypto.subtle.digest('SHA-1',payload));
 return reply({cloud_name:cloud,api_key:key,timestamp,folder,public_id,signature,max_bytes:10000000});
}
