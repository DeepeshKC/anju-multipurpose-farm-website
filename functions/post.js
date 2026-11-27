import { sanitizePublishedHTML } from './_article-html.js';
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
  const publisher = {'@type':'Organization','@id':origin+'/#organization',name:'Anju Multipurpose Agriculture Farm',url:origin+'/'};
  const graph = [publisher, {'@type':'BlogPosting','@id':canonical+'#article',headline:String(post.title || 'Farm Story'),description,image:[image],inLanguage:language,mainEntityOfPage:canonical,publisher:{'@id':publisher['@id']}}, {'@type':'BreadcrumbList',itemListElement:[{ '@type':'ListItem',position:1,name:language==='ne'?'गृहपृष्ठ':'Home',item:origin+'/'},{'@type':'ListItem',position:2,name:language==='ne'?'ब्लग':'Blog',item:origin+'/blog.html'},{'@type':'ListItem',position:3,name:String(post.title || 'Farm Story'),item:canonical}]}];
  const structured = JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c');
  const tags = [ `<script type="application/ld+json">${structured}</script>`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width,initial-scale=1">`, `<title>${escape(title)}</title>`, meta('name','description',description), meta('name','robots',staging?'noindex,nofollow':'index,follow'), ...Object.entries({'og:type':'article','og:title':title,'og:description':description,'og:image':image,'og:url':canonical,'og:locale':language==='ne'?'ne_NP':'en_US'}).map(([k,v])=>meta('property',k,v)), ...Object.entries({'twitter:card':'summary_large_image','twitter:title':title,'twitter:description':description,'twitter:image':image}).map(([k,v])=>meta('name',k,v)), `<link rel="canonical" href="${escape(canonical)}">`, `<link rel="alternate" hreflang="en" href="${escape(path+'en')}">`, post.has_nepali_publication ? `<link rel="alternate" hreflang="ne" href="${escape(path+'ne')}">` : '', '<link href="css/style.css" rel="stylesheet">','<script defer src="js/script.js"></script>','<script defer src="js/post.js"></script>' ].join('\n');
  if (!/<head>[\s\S]*?<\/head>/i.test(html)) return error(503,'Article template unavailable');
  const articlePattern = /<article class="blog-article" id="post">[\s\S]*?<\/article>/i;
  if (!articlePattern.test(html)) return error(503,'Article template unavailable');
  let body;
  try {
    body = post.content_format === 'html'
      ? await sanitizePublishedHTML(post.content)
      : String(post.content ?? '').split(/\n\s*\n/).filter(Boolean).map(p => `<p>${escape(p)}</p>`).join('');
  } catch (e) {
    console.error('Article sanitization failed', e);
    return error(503,'Article temporarily unavailable');
  }
  const back = lang === 'ne' ? '← सबै कथाहरू' : '← All stories';
  const notice = post.fallback ? '<p class="blog-language-notice" role="status">यस कथाको नेपाली अनुवाद अझै उपलब्ध छैन। यो कथा अंग्रेजीमा देखाइएको छ।</p>' : '';
  const article = `<article class="blog-article" id="post" data-rendered-language="${lang}" data-content-language="${language}"><a class="blog-back" href="blog.html">${back}</a><span class="eyebrow">${escape(lang === 'ne' && String(post.category ?? '').toLowerCase() === 'farm stories' ? 'फार्मका कथाहरू' : post.category ?? '')}</span><h1>${escape(post.title ?? '')}</h1>${notice}${post.social_image && image===post.social_image ? `<img class="blog-featured-image" src="${escape(image)}" alt="${escape(post.featured_alt || '')}">` : ''}<div class="blog-article-content">${body}</div></article>`;
  const localized = lang === 'ne' ? html.replace(/(<[^>]+data-en="[^"]*"[^>]*data-ne="([^"]*)"[^>]*>)[^<]*(?=<)/g, (_, tag, translation) => tag + translation).replace('type="button">नेपाली</button>', 'type="button">English</button>') : html;
  return new Response(localized.replace(/<html lang="en">/i,`<html lang="${language}">`).replace(/<head>[\s\S]*?<\/head>/i,()=>`<head>\n${tags}\n</head>`).replace(articlePattern,()=>article),{headers});
}
