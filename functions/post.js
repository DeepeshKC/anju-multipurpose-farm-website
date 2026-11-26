import { onRequestGet as readArticle } from './api/post/[slug].js';
const origin = 'https://www.anjumultipurposefarm.com.np';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meta = (kind, key, value) => `<meta ${kind}="${key}" content="${escape(value)}">`;
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const staging = !['www.anjumultipurposefarm.com.np','anjumultipurposefarm.com.np'].includes(url.hostname);
  const slug = url.searchParams.get('slug') || '';
  const lang = url.searchParams.get('lang') || 'en';
  const headers = {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'};
  if (staging) headers['X-Robots-Tag'] = 'noindex, nofollow';
  const error = (status, message) => new Response(message, {status, headers:{...headers,'Content-Type':'text/plain; charset=utf-8','X-Robots-Tag':'noindex, nofollow'}});
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100 || !['en','ne'].includes(lang)) return error(404,'Article not found');
  const result = await readArticle({...context, params:{slug}});
  if (!result.ok) return error(result.status === 404 ? 404 : 503, result.status === 404 ? 'Article not found' : 'Article temporarily unavailable');
  const {post} = await result.json();
  const asset = await context.next();
  if (!asset.ok) return asset;
  const html = await asset.text();
  const language = post.language === 'ne' ? 'ne' : 'en';
  const title = String(post.title || 'Farm Story') + ' | Anju Farm';
  const description = String(post.excerpt || '').replace(/<[^>]*>/g,'').trim().slice(0,160) || (language === 'ne' ? 'अञ्जु फार्मका कथा र अनुभवहरू।' : 'Stories from Anju Farm in Nepal.');
  const path = origin + '/post?slug=' + encodeURIComponent(post.slug) + '&lang=';
  const canonical = path + language;
  const image = /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(post.social_image || '') ? post.social_image : origin + '/images/anju-farm-social-preview.jpg';
  const tags = [ `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`, `<title>${escape(title)}</title>`, meta('name','description',description), meta('name','robots',staging?'noindex,nofollow':'index,follow'), ...Object.entries({'og:type':'article','og:title':title,'og:description':description,'og:image':image,'og:url':canonical,'og:locale':language==='ne'?'ne_NP':'en_US'}).map(([k,v])=>meta('property',k,v)), ...Object.entries({'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':image}).map(([k,v])=>meta('name',k,v)), `<link rel="canonical" href="${escape(canonical)}">`, `<link rel="alternate" hreflang="en" href="${escape(path+'en')}">`, post.has_nepali_publication ? `<link rel="alternate" hreflang="ne" href="${escape(path+'ne')}">` : '', '<link href="css/style.css" rel="stylesheet">','<script defer src="js/script.js"></script>','<script defer src="js/post.js"></script>' ].join('\n');
  if (!/<head>[\s\S]*?<\/head>/i.test(html)) return error(503,'Article template unavailable');
  return new Response(html.replace(/<html lang="en">/i,`<html lang="${language}">`).replace(/<head>[\s\S]*?<\/head>/i,()=>`<head>\n${tags}\n</head>`),{headers});
}
