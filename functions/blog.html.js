import { onRequestGet as readPosts } from './api/posts.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageOK = s => /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(s||'');
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const staging = !['www.anjumultipurposefarm.com.np','anjumultipurposefarm.com.np'].includes(url.hostname);
  const headers = {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'};
  if(staging) headers['X-Robots-Tag']='noindex, nofollow';
  const fail = () => new Response('Stories temporarily unavailable. Please try again later.',{status:503,headers:{...headers,'Retry-After':'120'}});
  try {
    const api = new URL('/api/posts?lang=en',url);
    const result = await readPosts({...context,request:new Request(api)});
    if(!result.ok) return fail();
    const {posts} = await result.json();
    if(!Array.isArray(posts)) return fail();
    const asset = await context.next();
    if(!asset.ok) return asset;
    const html = await asset.text();
    const pattern = /<div class="blog-list" id="blog-list">[\s\S]*?<\/div>/i;
    if(!pattern.test(html)) return fail();
    const cards = posts.map(p=>`<article class="blog-card">${imageOK(p.featured_image)?`<img class="blog-featured-image" loading="lazy" src="${esc(p.featured_image)}" alt="${esc(p.featured_alt)}">`:''}<span class="eyebrow">${esc(p.category)}</span><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><a class="text-link" href="/post?slug=${encodeURIComponent(p.slug)}&amp;lang=en">Read story ↗</a></article>`).join('') || '<p>No stories have been published yet. Please check back soon.</p>';
    return new Response(html.replace(pattern,()=>`<div class="blog-list" id="blog-list" data-rendered-language="en">${cards}</div>`).replace('src="js/blog.js"','src="js/blog.js?v=24c2"'),{headers});
  } catch(error) { console.error('Blog server rendering failed',error); return fail(); }
}
