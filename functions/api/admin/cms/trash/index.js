import {reply,guard} from '../../../../_shared.js';
export async function onRequestGet(ctx){
 const denied=await guard(ctx);if(denied)return denied;
 if(!ctx.env.DB)return reply({error:'Database unavailable'},503);
 try{const {results}=await ctx.env.DB.prepare(`SELECT p.id,p.title,p.slug,t.deleted_at FROM article_trash t JOIN posts p ON p.id=t.post_id ORDER BY t.deleted_at DESC LIMIT 200`).all();return reply({articles:results||[]});}
 catch(e){console.error(e);return reply({error:'Could not load trash. Apply migration 0006.'},503);}
}
