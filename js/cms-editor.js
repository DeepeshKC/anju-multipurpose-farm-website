
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

    const statusMessage = document.createElement('p');
    statusMessage.id = 'cms-status-message';
    statusMessage.setAttribute('role', 'status');
    statusMessage.setAttribute('aria-live', 'polite');
    form.before(statusMessage);

    const titleField = document.getElementById('cms-title');
    const slugField = document.getElementById('cms-slug');
    const categoryField = document.getElementById('cms-category');
    const excerptField = document.getElementById('cms-excerpt');
    const seoTitleField = document.getElementById('cms-seo-title');
    const seoDescriptionField = document.getElementById('cms-seo-description');

    let editingId = null;
    let saving = false;
    let loading = false;

    function showStatus(message, isError = false) {
      statusMessage.textContent = message;
      statusMessage.className = isError ? 'admin-error' : 'admin-note';
    }

    function clearForm() {
      form.reset();
      editor.commands.clearContent();

      categoryField.value = 'FARM STORIES';
      slugField.readOnly = false;

      editingId = null;
    }

    function openNewDraft() {
      if (saving || loading) return;

      clearForm();

      form.hidden = false;
      saveButton.disabled = false;
      saveButton.textContent = 'Save English draft';

      showStatus('Creating a new English draft.');
      titleField.focus();
    }

    async function openExistingDraft(id) {
      if (saving || loading) return;

      loading = true;
      newButton.disabled = true;
      saveButton.disabled = true;

      showStatus('Loading English draft...');

      try {
        const response = await fetch(
          `/api/admin/cms/articles/${id}`,
          { credentials: 'same-origin' }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || 'Unable to load English draft.'
          );
        }

        const article = data.article;

        if (!article || !article.content_json) {
          throw new Error('Article content is missing.');
        }

        clearForm();

        editingId = article.id;

        titleField.value = article.title || '';
        slugField.value = article.slug || '';
        categoryField.value = article.category || 'FARM STORIES';
        excerptField.value = article.excerpt || '';
        seoTitleField.value = article.seo_title || '';
        seoDescriptionField.value = article.seo_description || '';

        // Slugs cannot be changed through the current PUT API.
        slugField.readOnly = true;

        editor.commands.setContent(article.content_json);

        form.hidden = false;
        saveButton.textContent = 'Update English draft';

        showStatus(`Editing English draft #${editingId}.`);

        form.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

      } catch (error) {
        console.error('CMS draft loading failed:', error);
        showStatus(error.message, true);

      } finally {
        loading = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

    async function loadArticles() {
      try {
        const response = await fetch(
          '/api/admin/cms/articles',
          { credentials: 'same-origin' }
        );

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

          const title =
            article.english_title ||
            article.legacy_title ||
            'Untitled article';

          const label = document.createElement('span');
          label.textContent =
            `${title} — ${article.slug} (${article.english_status || article.legacy_status})`;

          item.appendChild(label);

          // Only English CMS drafts can be edited here.
          if (
            article.english_translation_id &&
            article.legacy_status === 'draft'
          ) {
            const editButton = document.createElement('button');

            editButton.type = 'button';
            editButton.textContent = 'Edit English';
            editButton.setAttribute(
              'aria-label',
              `Edit English draft: ${title}`
            );

            editButton.addEventListener('click', () => {
              openExistingDraft(article.id);
            });

            item.appendChild(editButton);
          }

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

    newButton.addEventListener('click', openNewDraft);

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (saving || loading) return;
      if (!form.reportValidity()) return;

      if (editor.isEmpty) {
        showStatus('Please enter article content.', true);
        editor.commands.focus();
        return;
      }

      const payload = {
        title: titleField.value.trim(),
        category: categoryField.value.trim(),
        excerpt: excerptField.value.trim(),
        seo_title: seoTitleField.value.trim(),
        seo_description: seoDescriptionField.value.trim(),
        content_json: editor.getJSON()
      };

      const isEditing = editingId !== null;
      const targetId = editingId;

      if (!isEditing) {
        payload.slug = slugField.value.trim();
      }

      saving = true;
      saveButton.disabled = true;
      newButton.disabled = true;

      showStatus(
        isEditing
          ? 'Updating English draft...'
          : 'Saving English draft...'
      );

      try {
        const response = await fetch(
          isEditing
            ? `/api/admin/cms/articles/${targetId}`
            : '/api/admin/cms/articles',
          {
            method: isEditing ? 'PUT' : 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
            (isEditing
              ? 'Unable to update English draft.'
              : 'Unable to create English draft.')
          );
        }

        const savedId = result.id;

        clearForm();
        form.hidden = true;

        showStatus(
          isEditing
            ? `English draft #${savedId} updated successfully.`
            : `English draft created successfully. Article ID: ${savedId}`
        );

        console.log('CMS draft saved:', result);

        await loadArticles();

      } catch (error) {
        console.error('CMS draft saving failed:', error);
        showStatus(error.message, true);

      } finally {
        saving = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    });

    loadArticles();

    console.log('Anju Farm TipTap CMS editor initialized.');

  } catch (error) {
    console.error('TipTap initialization failed:', error);
  }
}
