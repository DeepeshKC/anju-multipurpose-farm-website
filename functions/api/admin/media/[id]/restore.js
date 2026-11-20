import {reply,guard,sameOrigin} from '../../../../_shared.js';
export async function onRequestPost(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!sameOrigin(ctx.request))return reply({error:'Invalid origin'},403);
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 const id=Number(ctx.params.id);if(!Number.isSafeInteger(id)||id<1)return reply({error:'Invalid media ID'},400);
 try{const row=await ctx.env.DB.prepare('DELETE FROM cloudinary_media_trash WHERE media_id=? RETURNING media_id').bind(id).first();return row?reply({ok:true}):reply({error:'Photograph not found in Trash'},404);}
 catch(e){console.error(e);return reply({error:'Could not restore photograph'},503);}
}
