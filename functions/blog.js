import { onRequestGet as readPosts } from './api/posts.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function blogImage(p, priority) {
  const src = p.featured_image || '';
  if (!/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(src)) return '';
  const variant = w => src.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${w}/`);
  const srcset = [320, 480, 640, 800, 960, 1280, 1600].map(w => `${variant(w)} ${w}w`).join(', ');
  return `<img class="blog-featured-image" loading="${priority ? 'eager' : 'lazy'}"${priority ? ' fetchpriority="high"' : ''} decoding="async" src="${esc(variant(640))}" srcset="${esc(srcset)}" sizes="(max-width: 800px) 88vw, (max-width: 1340px) 29vw, 350px" alt="${esc(p.featured_alt)}">`;
}
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const staging = !['www.anjumultipurposefarm.com.np','anjumultipurposefarm.com.np'].includes(url.hostname);
  const headers = {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Blog-Renderer':'24c2a'};
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
    const cards = posts.map((p,i)=>`<article class="blog-card">${blogImage(p,i===0)}<span class="eyebrow">${esc(p.category)}</span><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p><a class="text-link" href="/post?slug=${encodeURIComponent(p.slug)}&amp;lang=en">Read story ↗</a></article>`).join('') || '<p>No stories have been published yet. Please check back soon.</p>';
    return new Response(html.replace(pattern,()=>`<div class="blog-list" id="blog-list" data-rendered-language="en" data-blog-renderer="24c2a">${cards}</div>`).replace('src="js/blog.js"','src="js/blog.js?v=24f1"').replace('</head>','<link rel="preconnect" href="https://res.cloudinary.com"></head>'),{headers});
  } catch(error) { console.error('Blog server rendering failed',error); return fail(); }
}
