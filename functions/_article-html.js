// Transform only original, versioned Cloudinary image URLs. Preserve stored originals.
export function deliveryAttrs(src, dimensions, priority = false) {
  const match = /^(https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/)(v[0-9]+\/[a-zA-Z0-9_./-]+)$/.exec(src);
  const attrs = {src, loading: priority ? 'eager' : 'lazy', decoding: 'async'};
  if (priority) attrs.fetchpriority = 'high';
  const d = dimensions?.find(x => x.secure_url === src);
  if (d && Number.isSafeInteger(d.width) && Number.isSafeInteger(d.height) && d.width > 0 && d.height > 0) {
    attrs.width = String(d.width); attrs.height = String(d.height);
  }
  if (match) {
    const limit = Math.min(d?.width || 1600, 1600);
    const widths = [...new Set([480, 768, 1024, 1280, 1600].map(w => Math.min(w, limit)))];
    const variant = w => `${match[1]}f_auto,q_auto,c_limit,w_${w}/${match[2]}`;
    attrs.src = variant(Math.min(768, limit));
    attrs.srcset = widths.map(w => `${variant(w)} ${w}w`).join(', ');
    attrs.sizes = '(max-width: 850px) 88vw, 750px';
  }
  return attrs;
}
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
export async function sanitizePublishedHTML(html, dimensions = []) {
  let firstImage = true;
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
        for (const [key,value] of Object.entries(deliveryAttrs(attrs.src, dimensions, firstImage))) el.setAttribute(key,value);
        firstImage = false;
        el.setAttribute('alt', attrs.alt || '');
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
