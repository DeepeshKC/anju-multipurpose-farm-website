import {reply} from '../_shared.js';
export async function onRequestGet({env}){if(!env.DB)return reply({error:'Database not configured'},503);const {results}=await env.DB.prepare("SELECT slug,title,excerpt,category,published_at FROM posts WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT 100").all();return reply({posts:results});}
