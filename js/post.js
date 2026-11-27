function safeArticleLink(raw) {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && u.hostname && !u.username && !u.password) return u.href;
    if (u.protocol === 'mailto:' && /^mailto:[^\s@?]+@[^\s@?]+(?:\?[^\s]*)?$/i.test(raw)) return raw;
  } catch (_) {}
  return null;
}


const article = document.getElementById('post');

const lang = () =>
  localStorage.getItem('anjuFarmLanguage') === 'ne'
    ? 'ne'
    : 'en';

const params = new URLSearchParams(window.location.search);
const slug = params.get('slug');

let loadedPost = null;
let postError = false;
let requestNumber = 0;

// Sanitize published CMS HTML before inserting it into the page.
function sanitizeArticleHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');

  const allowedTags = new Set([
    'P',
    'H2',
    'H3',
    'H4',
    'UL',
    'OL',
    'LI',
    'STRONG',
    'B',
    'EM',
    'I',
    'BR',
    'BLOCKQUOTE',
    'FIGURE', 'FIGCAPTION', 'IMG', 'HR', 'S', 'U', 'CODE', 'A'
  ]);

  const blockedTags = new Set([
    'SCRIPT',
    'STYLE',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'SVG',
    'MATH',
    'FORM',
    'INPUT',
    'BUTTON',
    'TEXTAREA',
    'SELECT',
    'TEMPLATE',
    'LINK',
    'META',
    'BASE',
    'VIDEO',
    'AUDIO'
  ]);

  function clean(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        continue;
      }

      if (child.nodeType === Node.TEXT_NODE) {
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        continue;
      }

      if (blockedTags.has(child.tagName)) {
        child.remove();
        continue;
      }

      clean(child);

      // Preserve only the CMS-generated image crop window inside a figure.
      // All other DIV elements are unwrapped as before.
      if (child.tagName === 'DIV') {
        const isImageWindow = child.parentElement?.tagName === 'FIGURE' &&
          child.classList.contains('farm-image-window') &&
          [...child.classList].every(name => name === 'farm-image-window') &&
          child.querySelector('img') !== null;
        if (isImageWindow) {
          for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
          child.className = 'farm-image-window';
        } else {
          child.replaceWith(...child.childNodes);
        }
        continue;
      }

      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }

      // Keep only safe Cloudinary image URLs and accessibility metadata.
      const href = child.tagName === 'A' ? safeArticleLink(child.getAttribute('href') || '') : null;
      const src = child.tagName === 'IMG' ? child.getAttribute('src') : null;
      const alt = child.tagName === 'IMG' ? child.getAttribute('alt') : null;
      const figureData = child.tagName === 'FIGURE' ? {
        classes: (child.getAttribute('class') || '').split(/\s+/).filter(x => /^farm-(?:inline-image|size-(?:small|medium|large|full)|align-(?:left|center|right)|wrap-(?:none|left|right))$/.test(x)),
        widthPct: Number(child.dataset.widthPct || 100), crop: Number(child.dataset.crop || 100),
        cropX: Number(child.dataset.cropX || 50), cropY: Number(child.dataset.cropY || 50)
      } : null;
      for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
      if (figureData) {
        child.className = figureData.classes.join(' ');
        for (const [key,min,max] of [['widthPct',15,100],['crop',25,100],['cropX',0,100],['cropY',0,100]]) {
          const val = figureData[key];
          if (Number.isInteger(val) && val >= min && val <= max) child.style.setProperty({widthPct:'--farm-width',crop:'--farm-crop',cropX:'--farm-crop-x',cropY:'--farm-crop-y'}[key], `${val}%`);
        }
      }
      if (child.tagName === 'A') {
        if (!href) { child.replaceWith(...child.childNodes); continue; }
        child.setAttribute('href', href);
        if (href.startsWith('https:')) { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      }
      if (child.tagName === 'IMG') {
        if (!src || !/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(src)) {
          child.remove(); continue;
        }
        child.setAttribute('src', src);
        child.setAttribute('alt', alt || '');
        child.setAttribute('loading', 'lazy');
      }
    }
  }

  clean(template.content);
  return template.content;
}

// Keep page metadata synchronized with the language actually displayed.
function updateArticleSEO(post) {
  const isStaging = location.hostname !== 'www.anjumultipurposefarm.com.np' && location.hostname !== 'anjumultipurposefarm.com.np';
  const language = post.language === 'ne' ? 'ne' : 'en';
  const description = String(post.excerpt || '').replace(/<[^>]*>/g, '').trim().slice(0, 160) ||
    (language === 'ne' ? 'अञ्जु फार्मका कथा र अनुभवहरू।' : 'Stories from Anju Farm in Nepal.');
  const title = String(post.title || 'Farm Story') + ' | Anju Farm';
  const origin = 'https://www.anjumultipurposefarm.com.np';
  const articlePath = '/post?slug=' + encodeURIComponent(post.slug) + '&lang=';
  const canonical = origin + articlePath + language;
  const setMeta = (selector, attribute, value) => {
    const el = document.querySelector(selector);
    if (el) el.setAttribute(attribute, value);
  };
  const setLink = (rel, hreflang, href) => {
    const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
    let el = document.querySelector(selector);
    if (!el) { el = document.createElement('link'); el.rel = rel; if (hreflang) el.hreflang = hreflang; document.head.append(el); }
    el.href = href;
  };
  const image = /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(post.social_image || '') ? post.social_image : origin + '/images/anju-farm-social-preview.jpg';
  setMeta('meta[property="og:image"]', 'content', image);
  setMeta('meta[name="twitter:image"]', 'content', image);
  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', canonical);
  setMeta('meta[property="og:locale"]', 'content', language === 'ne' ? 'ne_NP' : 'en_US');
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  setMeta('meta[name="robots"]', 'content', isStaging ? 'noindex,nofollow' : 'index,follow');
  setLink('canonical', null, canonical);
  setLink('alternate', 'en', origin + articlePath + 'en');
  // Only advertise a genuinely published Nepali translation.
  if (post.has_nepali_publication) setLink('alternate', 'ne', origin + articlePath + 'ne');
  else document.querySelectorAll('link[rel="alternate"][hreflang="ne"]').forEach(el => el.remove());
}

function renderPost() {
  if (!article) return;

  const ne = lang() === 'ne';

  if (postError) {
    article.textContent = ne
      ? 'यो कथा उपलब्ध छैन वा प्रकाशित भएको छैन।'
      : 'This story is unavailable or has not been published.';
    return;
  }

  if (!loadedPost) {
    article.textContent = ne
      ? 'कथा लोड हुँदैछ…'
      : 'Loading story…';
    return;
  }

  const p = loadedPost;

  updateArticleSEO(p);

  document.documentElement.lang = p.language === 'ne' ? 'ne' : 'en';

  const back = document.createElement('a');
  back.href = 'blog.html';
  back.className = 'blog-back';
  back.textContent = ne
    ? '← सबै कथाहरू'
    : '← All stories';

  const category = document.createElement('span');
  category.className = 'eyebrow';
  category.textContent = p.category ?? '';

  const heading = document.createElement('h1');
  heading.textContent = p.title ?? '';

  article.replaceChildren(back, category, heading);
  const byline = document.createElement('p'); byline.className = 'blog-byline';
  const isNe = p.language === 'ne';
  byline.textContent = p.author || (isNe ? 'अञ्जु बहुउद्देश्यीय कृषि फार्म' : 'Anju Multipurpose Agriculture Farm');
  const date = v => {const d=new Date(String(v||'').replace(' ','T')+'Z');return Number.isFinite(d.getTime())?d:null;};
  const fmt = d => new Intl.DateTimeFormat(isNe?'ne-NP':'en-US',{dateStyle:'long',timeZone:'Asia/Kathmandu'}).format(d);
  const pub=date(p.published_at), mod=date(p.modified_at);
  function addDate(label,d){const t=document.createElement('time');t.dateTime=d.toISOString();t.textContent=fmt(d);byline.append(document.createTextNode(' · '+label+' '),t);}
  if(pub)addDate(isNe?'प्रकाशित':'Published',pub);
  if(mod&&(!pub||fmt(pub)!==fmt(mod)))addDate(isNe?'अद्यावधिक':'Updated',mod);
  article.append(byline);

  // Show a notice when Nepali was requested but English is displayed.
  if (ne && p.fallback) {
    const notice = document.createElement('p');
    notice.className = 'blog-language-notice';
    notice.setAttribute('role', 'status');
    notice.textContent =
      'यस कथाको नेपाली अनुवाद अझै उपलब्ध छैन। यो कथा अंग्रेजीमा देखाइएको छ।';

    article.append(notice);
  }

  const content = document.createElement('div');
  content.className = 'blog-article-content';

  if (p.content_format === 'html') {
    content.append(sanitizeArticleHTML(p.content));
  } else {
    const paragraphs = String(p.content ?? '')
      .split(/\n\s*\n/)
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      const element = document.createElement('p');
      element.textContent = paragraph;
      content.append(element);
    }
  }

  if (/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(p.social_image || '')) {
    const cover=document.createElement('img');cover.className='blog-featured-image';cover.src=p.social_image;cover.alt=p.featured_alt||'';article.append(cover);
  }
  article.append(content);
}

async function loadPost() {
  if (!article) return;

  if (!slug) {
    postError = true;
    renderPost();
    return;
  }

  const selectedLanguage = lang();
  const currentRequest = ++requestNumber;

  loadedPost = null;
  postError = false;
  renderPost();

  try {
    const response = await fetch(
      `/api/post/${encodeURIComponent(slug)}?lang=${encodeURIComponent(selectedLanguage)}`
    );

    if (!response.ok) {
      throw new Error('Unable to load article');
    }

    const data = await response.json();

    if (currentRequest !== requestNumber) {
      return;
    }

    if (!data.post || typeof data.post !== 'object') {
      throw new Error('Invalid article response');
    }

    loadedPost = data.post;

    const updatedURL = new URL(window.location.href);
    updatedURL.searchParams.set('lang', selectedLanguage);

    window.history.replaceState(null, '', updatedURL);

    renderPost();

  } catch (error) {
    if (currentRequest !== requestNumber) {
      return;
    }

    console.error('Article loading failed', error);

    postError = true;
    renderPost();
  }
}

// Respect the language selected in the article URL.
const requestedLanguage = params.get('lang');

if (requestedLanguage === 'en' || requestedLanguage === 'ne') {
  localStorage.setItem('anjuFarmLanguage', requestedLanguage);
}

document.addEventListener('anju-language-change', loadPost);

// The server already rendered the requested published revision. Keep it visible
// on first load; the existing language-change handler loads another revision.
if (article?.dataset.renderedLanguage === lang()) {
  document.documentElement.lang = article.dataset.contentLanguage === 'ne' ? 'ne' : 'en';
} else {
  loadPost();
}
