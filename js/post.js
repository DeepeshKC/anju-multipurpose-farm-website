
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
    'BLOCKQUOTE'
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
    'IMG',
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

      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }

      // Remove all HTML attributes, including event handlers.
      for (const attribute of [...child.attributes]) {
        child.removeAttribute(attribute.name);
      }
    }
  }

  clean(template.content);
  return template.content;
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

  document.title =
    p.title + ' | ' + (ne ? 'अञ्जु फार्म' : 'Anju Farm');

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

loadPost();
