
const $ = id => document.getElementById(id);

let posts = [];
let editing = null;
let cmsManagedIds = new Set();

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').className = error ? 'admin-error' : 'admin-note';
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function show(authenticated) {
  $('login-section').hidden = authenticated;
  $('editor-section').hidden = !authenticated;
  $('cms-section').hidden = !authenticated;
}

async function refresh() {
  // Fetch both lists before deciding which articles
  // the legacy editor is allowed to open.
  const [legacyData, cmsData] = await Promise.all([
    api('/api/admin/posts'),
    api('/api/admin/cms/articles')
  ]);

  posts = legacyData.posts || [];

  cmsManagedIds = new Set(
    (cmsData.articles || [])
      .filter(article => article.english_translation_id != null)
      .map(article => Number(article.id))
  );

  const list = $('posts-list');
  list.replaceChildren();

  for (const post of posts) {
    const item = document.createElement('li');

    const title = document.createElement('span');
    title.textContent = `${post.title} (${post.status}) `;

    item.appendChild(title);

    if (cmsManagedIds.has(Number(post.id))) {
      const label = document.createElement('span');
      label.textContent = 'Managed in New CMS';
      label.className = 'admin-note';

      item.appendChild(label);
    } else {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Edit';

      button.addEventListener('click', () => {
        edit(post);
      });

      item.appendChild(button);
    }

    list.appendChild(item);
  }

  // If an article became CMS-managed while the old
  // editor was open, reset the legacy form.
  if (editing !== null && cmsManagedIds.has(Number(editing))) {
    edit();
    notice('This article is now managed in the New CMS.');
  }
}

function edit(post = null) {
  if (post && cmsManagedIds.has(Number(post.id))) {
    notice(
      'This article is managed in the New CMS. Use Edit English instead.',
      true
    );
    return;
  }

  editing = post?.id ?? null;

  for (const key of [
    'title',
    'slug',
    'category',
    'excerpt',
    'content',
    'status'
  ]) {
    $(key).value = post?.[key] ??
      (key === 'category'
        ? 'FARM STORIES'
        : key === 'status'
          ? 'draft'
          : '');
  }

  $('editor-heading').textContent =
    post ? 'Edit article' : 'New article';

  $('delete-post').hidden = !post;

  notice('');
}

$('new-post').onclick = () => edit();

$('login-form').onsubmit = async event => {
  event.preventDefault();

  try {
    await api('/api/admin/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        password: $('password').value
      })
    });

    $('password').value = '';

    show(true);
    await refresh();

    notice('Signed in.');
  } catch (error) {
    notice(error.message, true);
  }
};

$('logout').onclick = async () => {
  try {
    await api('/api/admin/logout', {
      method: 'POST'
    });

    editing = null;
    posts = [];
    cmsManagedIds.clear();

    $('posts-list').replaceChildren();

    show(false);
    notice('Signed out.');
  } catch (error) {
    notice(error.message, true);
  }
};

$('post-form').onsubmit = async event => {
  event.preventDefault();

  // Prevent submission through the old editor
  // when the article is managed by the CMS.
  if (editing !== null && cmsManagedIds.has(Number(editing))) {
    notice(
      'This article must be edited through the New CMS.',
      true
    );
    return;
  }

  const post = Object.fromEntries(
    [
      'title',
      'slug',
      'category',
      'excerpt',
      'content',
      'status'
    ].map(key => [key, $(key).value])
  );

  try {
    await api(
      editing
        ? `/api/admin/posts/${editing}`
        : '/api/admin/posts',
      {
        method: editing ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(post)
      }
    );

    await refresh();
    edit();

    notice('Article saved.');
  } catch (error) {
    notice(error.message, true);
  }
};

$('delete-post').onclick = async () => {
  if (!editing) return;

  if (cmsManagedIds.has(Number(editing))) {
    notice(
      'CMS-managed articles cannot be deleted through the old editor.',
      true
    );
    return;
  }

  if (!confirm('Permanently delete this article?')) {
    return;
  }

  try {
    await api(`/api/admin/posts/${editing}`, {
      method: 'DELETE'
    });

    await refresh();
    edit();

    notice('Article deleted.');
  } catch (error) {
    notice(error.message, true);
  }
};

(async () => {
  try {
    const session = await api('/api/admin/session');

    show(session.authenticated);

    if (session.authenticated) {
      await refresh();
    }
  } catch (error) {
    show(false);
    notice(
      'Cannot reach blog API. Check Cloudflare setup.',
      true
    );
    console.error('Admin initialization failed:', error);
  }
})();
