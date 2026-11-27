const productionHosts = new Set(['www.anjumultipurposefarm.com.np','anjumultipurposefarm.com.np']);
export function onRequestGet({request}) {
  const production = productionHosts.has(new URL(request.url).hostname);
  const lines = ['User-agent: *','Allow: /','Disallow: /admin/','Disallow: /api/'];
  if (production) lines.push('Sitemap: https://www.anjumultipurposefarm.com.np/sitemap.xml');
  return new Response(lines.join('\n')+'\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store',...(!production?{'X-Robots-Tag':'noindex, nofollow'}:{})}});
}
