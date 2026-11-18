
import { Editor, StarterKit } from './tiptap-bundle.js';

const section = document.getElementById('cms-section');
const mount = document.getElementById('cms-rich-editor');
const toolbar = document.getElementById('cms-toolbar');
const form = document.getElementById('cms-form');
const newButton = document.getElementById('cms-new');
const saveButton = document.getElementById('cms-save');
const articlesList = document.getElementById('cms-articles-list');

if (!section || !mount || !toolbar || !form ||
    !newButton || !saveButton || !articlesList) {
  console.error('CMS editor HTML elements are missing.');
} else {
  try {
    const editor = new Editor({
      element: mount,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: false,
          codeBlock: false
        })
      ],
      content: '<p></p>'
    });

    const controls = [
      ['Bold', () => editor.chain().focus().toggleBold().run()],
      ['Italic', () => editor.chain().focus().toggleItalic().run()],
      ['H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
      ['H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
      ['Bullet list', () => editor.chain().focus().toggleBulletList().run()],
      ['Numbered list', () => editor.chain().focus().toggleOrderedList().run()],
      ['Quote', () => editor.chain().focus().toggleBlockquote().run()],
      ['Undo', () => editor.chain().focus().undo().run()],
      ['Redo', () => editor.chain().focus().redo().run()]
    ];

    for (const [label, action] of controls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      toolbar.appendChild(button);
    }

    // Display status messages inside the CMS section.
    const statusMessage = document.createElement('p');
    statusMessage.id = 'cms-status-message';
    statusMessage.setAttribute('role', 'status');
    statusMessage.setAttribute('aria-live', 'polite');
    form.before(statusMessage);

    function showStatus(message, isError = false) {
      statusMessage.textContent = message;
      statusMessage.className = isError ? 'admin-error' : 'admin-note';
    }

    function getField(id) {
      return document.getElementById(id).value.trim();
    }

    function clearForm() {
      form.reset();
      editor.commands.clearContent();
      document.getElementById('cms-category').value = 'FARM STORIES';
      showStatus('');
    }

    // Load the current CMS article overview.
    async function loadArticles() {
      try {
        const response = await fetch('/api/admin/cms/articles', {
          credentials: 'same-origin'
        });

        if (!response.ok) {
          throw new Error('Unable to load CMS articles.');
        }

        const data = await response.json();

        articlesList.replaceChildren();

        if (!data.articles || data.articles.length === 0) {
          const empty = document.createElement('li');
          empty.textContent = 'No CMS articles yet.';
          articlesList.appendChild(empty);
          return;
        }

        for (const article of data.articles) {
          const item = document.createElement('li');

          const title = article.english_title ||
            article.legacy_title ||
            'Untitled article';

          item.textContent =
            `${title} — ${article.slug} (${article.english_status || article.legacy_status})`;

          articlesList.appendChild(item);
        }
      } catch (error) {
        console.error('CMS article listing failed:', error);
        showStatus(error.message, true);
      }
    }

    form.hidden = true;
    newButton.disabled = false;
    saveButton.disabled = true;

    newButton.addEventListener('click', () => {
      clearForm();
      form.hidden = false;
      saveButton.disabled = false;
      document.getElementById('cms-title').focus();
      console.log('New English draft form opened.');
    });

    let saving = false;

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (saving) return;

      if (!form.reportValidity()) return;

      if (editor.isEmpty) {
        showStatus('Please enter article content before saving.', true);
        editor.commands.focus();
        return;
      }

      const payload = {
        title: getField('cms-title'),
        slug: getField('cms-slug'),
        category: getField('cms-category'),
        excerpt: getField('cms-excerpt'),
        seo_title: getField('cms-seo-title'),
        seo_description: getField('cms-seo-description'),
        content_json: editor.getJSON()
      };

      saving = true;
      saveButton.disabled = true;
      newButton.disabled = true;
      showStatus('Saving English draft...');

      try {
        const response = await fetch('/api/admin/cms/articles', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Unable to save draft.');
        }

        form.hidden = true;
        clearForm();

        showStatus(
          `English draft saved successfully. Article ID: ${result.id}`
        );

        await loadArticles();

        console.log('CMS English draft created:', result);

      } catch (error) {
        console.error('CMS draft saving failed:', error);
        showStatus(error.message, true);

      } finally {
        saving = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    });

    // Initial article list.
    loadArticles();

    console.log('Anju Farm TipTap CMS editor initialized.');

  } catch (error) {
    console.error('TipTap initialization failed:', error);
  }
}
