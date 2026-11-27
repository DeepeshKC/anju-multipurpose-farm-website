
const list = document.getElementById('blog-list');

const esc = s => String(s ?? '').replace(
  /[&<>"']/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c])
);

function blogImage(p, priority) {
  const src = p.featured_image || '';
  if (!/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(src)) return '';
  const variant = w => src.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_limit,w_${w}/`);
  const srcset = [320, 480, 640, 800, 960, 1280, 1600].map(w => `${variant(w)} ${w}w`).join(', ');
  return `<img class="blog-featured-image" loading="${priority ? 'eager' : 'lazy'}"${priority ? ' fetchpriority="high"' : ''} decoding="async" src="${esc(variant(640))}" srcset="${esc(srcset)}" sizes="(max-width: 800px) 88vw, (max-width: 1340px) 29vw, 350px" alt="${esc(p.featured_alt)}">`;
}

let selected = document.documentElement.lang === 'ne' ? 'ne' : 'en';
const lang = () => selected;

let blogPosts = null;
let blogError = false;
let requestNumber = 0;

function renderBlog() {
  const ne = lang() === 'ne';

  if (blogError) {
    if (list.querySelector('article.blog-card')) return;
    list.textContent = ne
      ? 'कथाहरू अहिले उपलब्ध छैनन्। कृपया पछि फेरि प्रयास गर्नुहोस्।'
      : 'Stories are temporarily unavailable. Please try again later.';
    return;
  }

  if (!blogPosts) {
    if (list.querySelector('article.blog-card')) return;
    list.textContent = ne
      ? 'कथाहरू लोड हुँदैछन्…'
      : 'Loading stories…';
    return;
  }

  if (!blogPosts.length) {
    list.textContent = ne
      ? 'अहिलेसम्म कुनै कथा प्रकाशित भएको छैन। कृपया पछि फेरि हेर्नुहोस्।'
      : 'No stories have been published yet. Please check back soon.';
    return;
  }

  list.innerHTML = blogPosts.map((p,i) => {
    const fallbackNotice =
      ne && p.fallback
        ? '<span class="blog-language-notice">नेपाली अनुवाद उपलब्ध छैन। अंग्रेजीमा पढ्नुहोस्।</span>'
        : '';

    const link = `/post?slug=${encodeURIComponent(p.slug)}&lang=${encodeURIComponent(ne ? 'ne' : 'en')}`;

    return `
      <article class="blog-card">
        ${blogImage(p,i===0)}
        <span class="eyebrow">${esc(p.category)}</span>
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.excerpt)}</p>
        ${fallbackNotice}
        <a class="text-link" href="${link}">
          ${ne
            ? (p.fallback ? 'अंग्रेजीमा पढ्नुहोस् ↗' : 'कथा पढ्नुहोस् ↗')
            : 'Read story ↗'}
        </a>
      </article>
    `;
  }).join('');
}

async function loadBlog() {
  const selectedLanguage = lang();
  const currentRequest = ++requestNumber;

  blogPosts = null;
  blogError = false;
  renderBlog();

  try {
    const response = await fetch(
      `/api/posts?lang=${encodeURIComponent(selectedLanguage)}`
    );

    if (!response.ok) {
      throw new Error('Unable to load articles');
    }

    const data = await response.json();

    if (currentRequest !== requestNumber) {
      return;
    }

    if (!Array.isArray(data.posts)) {
      throw new Error('Invalid article response');
    }

    blogPosts = data.posts;
    renderBlog();

  } catch (error) {
    if (currentRequest !== requestNumber) {
      return;
    }

    console.error('Blog loading failed', error);
    blogError = true;
    renderBlog();
  }
}

document.addEventListener('anju-language-change', event => {
  selected = event.detail?.language === 'ne' ? 'ne' : 'en';
  loadBlog();
});

if (list.dataset.renderedLanguage !== selected || !list.querySelector('article.blog-card')) loadBlog();
