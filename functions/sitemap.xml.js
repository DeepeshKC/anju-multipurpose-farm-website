// Dynamic sitemap for published CMS articles. Cloudflare Pages Function.
const DOMAIN = 'https://www.anjumultipurposefarm.com.np';
const xmlEscape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const entry = (url, date) => `<url><loc>${xmlEscape(url)}</loc>${date ? `<lastmod>${xmlEscape(date)}</lastmod>` : ''}</url>`;
export async function onRequestGet({ env, request }) {
  const hostname = new URL(request.url).hostname;
  // Staging must not advertise production URLs to search engines.
  if (hostname !== 'www.anjumultipurposefarm.com.np' && hostname !== 'anjumultipurposefarm.com.np') {
    return new Response('Staging sitemap disabled', {status:404, headers:{'X-Robots-Tag':'noindex'}});
  }
  if (!env.DB) return new Response('Database unavailable', {status:503});
  try {
    const {results = []} = await env.DB.prepare(`
      SELECT p.slug,
        en.language_published_at AS en_date,
        ne.language_published_at AS ne_date,
        CASE WHEN ne.published_revision_id IS NOT NULL THEN 1 ELSE 0 END AS has_ne
      FROM posts p
      JOIN post_translations en ON en.post_id = p.id AND en.language = 'en'
        AND en.published_english_revision_id IS NOT NULL
      LEFT JOIN post_translations ne ON ne.post_id = p.id AND ne.language = 'ne'
      WHERE NOT EXISTS (SELECT 1 FROM article_trash t WHERE t.post_id = p.id)
      ORDER BY p.id
    `).all();
    const urls = [entry(`${DOMAIN}/`),entry(`${DOMAIN}/blog.html`)];
    for (const item of results) {
      if (!item.slug) continue;
      const slug = encodeURIComponent(item.slug);
      urls.push(entry(`${DOMAIN}/post?slug=${slug}&lang=en`, item.en_date?.slice(0,10)));
      if (item.has_ne) urls.push(entry(`${DOMAIN}/post?slug=${slug}&lang=ne`, item.ne_date?.slice(0,10)));
    }
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, {headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch (err) {
    console.error('Sitemap query failed', err);
    return new Response('Sitemap unavailable', {status:503});
  }
}
