
import {reply,sameOrigin,safeJson,sessionCookie} from '../../_shared.js';

export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return reply({error:'Invalid origin'},403);

 if(!env.DB||!env.ADMIN_PASSWORD||!env.ADMIN_SECRET)
  return reply({error:'Admin not configured'},503);

 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const now=Math.floor(Date.now()/1000);

 // Reserve an attempt atomically before checking credentials.
 const row=await env.DB.prepare(`INSERT INTO login_attempts(ip,attempts,window_start) VALUES(?,1,?)
 ON CONFLICT(ip) DO UPDATE SET attempts=CASE WHEN ?-window_start>=900 THEN 1 ELSE attempts+1 END,
 window_start=CASE WHEN ?-window_start>=900 THEN ? ELSE window_start END
 WHERE ?-window_start>=900 OR attempts<8 RETURNING attempts`).bind(ip,now,now,now,now,now).first();
 if(!row)return reply({error:'Too many attempts. Try again in 15 minutes.'},429);

 const body=await safeJson(request);
 const candidate=typeof body?.password==='string'?body.password:'';

 // Password is a server-side secret; never expose it to client code.
 const a=new TextEncoder().encode(candidate);
 const b=new TextEncoder().encode(env.ADMIN_PASSWORD);

 let diff=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)
  diff|=(a[i]||0)^(b[i]||0);

 if(diff!==0){
  return reply({error:'Incorrect password'},401);
 }

 await env.DB.prepare('DELETE FROM login_attempts WHERE ip=?').bind(ip).run();

 return reply({ok:true},200,{'set-cookie':await sessionCookie(env)});
}
