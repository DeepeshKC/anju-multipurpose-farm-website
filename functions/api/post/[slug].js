import {reply} from '../../_shared.js';
export async function onRequestGet({env,params}){if(!env.DB)return reply({error:'Database not configured'},503);const post=await env.DB.prepare("SELECT slug,title,excerpt,content,category,published_at FROM posts WHERE slug=? AND status='published'").bind(params.slug).first();return post?reply({post}):reply({error:'Post not found'},404);}
