// Cloudflare HTMLRewriter parses markup before the allowlist is applied.
const allowed = new Set('p h2 h3 h4 ul ol li strong b em i br blockquote figure figcaption img hr s u code a'.split(' '));
const imageURL = /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/;
function safeLink(raw) {
  if (!raw || raw.length > 2048 || /[\\\u0000-\u0020\u007f]/.test(raw)) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && u.hostname && !u.username && !u.password) return u.href;
    if (u.protocol === 'mailto:' && /^mailto:[^\s@?]+@[^\s@?]+(?:\?[^\s]*)?$/i.test(raw)) return raw;
  } catch (_) {}
  return null;
}
export async function sanitizePublishedHTML(html) {
  const rewriter = new HTMLRewriter().on('*', {
    element(el) {
      const tag = el.tagName.toLowerCase();
      const attrs = Object.fromEntries(el.attributes);
      if (tag === 'div' || tag === 'span') {
        if (tag === 'div' && attrs.class === 'farm-image-window') {
          for (const name of Object.keys(attrs)) el.removeAttribute(name);
          el.setAttribute('class', 'farm-image-window');
        } else el.removeAndKeepContent();
        return;
      }
      // Drop unknown elements and their contents, including foreign namespaces.
      if (!allowed.has(tag)) { el.remove(); return; }
      for (const name of Object.keys(attrs)) el.removeAttribute(name);
      if (tag === 'a') {
        const href = safeLink(attrs.href);
        if (!href) { el.removeAndKeepContent(); return; }
        el.setAttribute('href', href);
        if (href.startsWith('https:')) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
      if (tag === 'img') {
        if (!imageURL.test(attrs.src || '')) { el.remove(); return; }
        el.setAttribute('src', attrs.src);
        el.setAttribute('alt', attrs.alt || '');
        el.setAttribute('loading', 'lazy');
      }
      if (tag === 'figure') {
        const classes = (attrs.class || '').split(/\s+/).filter(x => /^farm-(?:inline-image|size-(?:small|medium|large|full)|align-(?:left|center|right)|wrap-(?:none|left|right))$/.test(x));
        el.setAttribute('class', classes.join(' '));
        const styles = [];
        for (const [key, css, fallback, min, max] of [
          ['data-width-pct','--farm-width',100,15,100], ['data-crop','--farm-crop',100,25,100],
          ['data-crop-x','--farm-crop-x',50,0,100], ['data-crop-y','--farm-crop-y',50,0,100]
        ]) {
          const n = Number(attrs[key] || fallback);
          if (Number.isInteger(n) && n >= min && n <= max) styles.push(`${css}:${n}%`);
        }
        el.setAttribute('style', styles.join(';'));
      }
    },
    comments(c) { c.remove(); }
  }).onDocument({comments(c) { c.remove(); }});
  return rewriter.transform(new Response(String(html ?? ''), {headers:{'Content-Type':'text/html; charset=utf-8'}})).text();
}
