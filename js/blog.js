
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

  list.innerHTML = blogPosts.map(p => {
    const fallbackNotice =
      ne && p.fallback
        ? '<span class="blog-language-notice">नेपाली अनुवाद उपलब्ध छैन। अंग्रेजीमा पढ्नुहोस्।</span>'
        : '';

    const link = `/post?slug=${encodeURIComponent(p.slug)}&lang=${encodeURIComponent(ne ? 'ne' : 'en')}`;

    return `
      <article class="blog-card">
        ${/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/[a-zA-Z0-9_./-]+$/.test(p.featured_image||'') ? `<img class="blog-featured-image" loading="lazy" src="${esc(p.featured_image)}" alt="${esc(p.featured_alt)}">` : ''}
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
