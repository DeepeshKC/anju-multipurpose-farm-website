const enc = new TextEncoder();
export const reply=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sign=async (payload,secret)=>{const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc.encode(payload)));};
export async function isAdmin(request,env){if(!env.ADMIN_SECRET)return false;const cookie=request.headers.get('cookie')||'';const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('anju_admin='))?.slice(11);if(!token)return false;const [exp,sig]=token.split('.');if(!/^\d+$/.test(exp)||Number(exp)<Date.now()||!sig)return false;return (await sign(exp,env.ADMIN_SECRET))===sig;}
export async function sessionCookie(env){const exp=String(Date.now()+12*60*60*1000);return `anju_admin=${exp}.${await sign(exp,env.ADMIN_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=43200`;}
export const clearCookie='anju_admin=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0';
export const guard=async(context)=>await isAdmin(context.request,context.env)?null:reply({error:'Unauthorized'},401);
export function sameOrigin(request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;}
export function validatePost(p){if(!p||typeof p!=='object')return 'Invalid post';for(const k of ['title','slug','excerpt','content','category','status'])if(typeof p[k]!=='string')return `Invalid ${k}`;if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)||p.slug.length>100)return 'Slug must contain lowercase letters, numbers and hyphens';if(!p.title.trim()||p.title.length>150||p.excerpt.length>350||p.content.length>30000||p.category.length>60)return 'Check title, excerpt, content and category lengths';if(!['draft','published'].includes(p.status))return 'Invalid status';return null;}
export const safeJson=async request=>{try{return await request.json()}catch{return null}};
