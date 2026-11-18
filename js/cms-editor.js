
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

    const languageMessage = document.createElement('p');
    languageMessage.id = 'cms-language-message';
    languageMessage.setAttribute('role', 'status');
    form.before(languageMessage);

    const titleField = document.getElementById('cms-title');
    const slugField = document.getElementById('cms-slug');
    const categoryField = document.getElementById('cms-category');
    const excerptField = document.getElementById('cms-excerpt');
    const seoTitleField = document.getElementById('cms-seo-title');
    const seoDescriptionField = document.getElementById('cms-seo-description');

    let editingId = null;
    let editingLanguage = 'en';
    let saving = false;
    let loading = false;
    let submittingReview = false;

    function showStatus(message, isError = false) {
      statusMessage.textContent = message;
      statusMessage.className = isError ? 'admin-error' : 'admin-note';
    }

    function setLanguage(language) {
      editingLanguage = language;

      languageMessage.textContent = language === 'ne'
        ? 'Editing language: नेपाली (Nepali)'
        : 'Editing language: English';

      languageMessage.className = 'admin-note';

      slugField.readOnly = editingId !== null;
      categoryField.readOnly = language === 'ne';
    }

    function clearForm() {
      form.reset();
      editor.commands.clearContent();

      categoryField.value = 'FARM STORIES';
      slugField.readOnly = false;
      categoryField.readOnly = false;

      editingId = null;
      setLanguage('en');
    }

    function openNewDraft() {
      if (saving || loading || submittingReview) return;

      clearForm();

      form.hidden = false;
      saveButton.disabled = false;
      saveButton.textContent = 'Save English draft';

      showStatus('Creating a new English draft.');
      titleField.focus();
    }

    async function getJSON(url) {
      const response = await fetch(url, {
        credentials: 'same-origin'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
      }

      return data;
    }

    async function openExistingDraft(id) {
      if (saving || loading || submittingReview) return;

      loading = true;
      newButton.disabled = true;
      saveButton.disabled = true;

      showStatus('Loading English draft...');

      try {
        const data = await getJSON(
          `/api/admin/cms/articles/${id}`
        );

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

        setLanguage('en');
        editor.commands.setContent(article.content_json);

        form.hidden = false;
        saveButton.textContent = 'Update English draft';

        showStatus(`Editing English draft #${editingId}.`);

        form.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

      } catch (error) {
        console.error('English draft loading failed:', error);
        showStatus(error.message, true);

      } finally {
        loading = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

    async function openNepaliDraft(id) {
      if (saving || loading || submittingReview) return;

      loading = true;
      newButton.disabled = true;
      saveButton.disabled = true;

      showStatus('Loading Nepali translation...');

      try {
        const [englishData, nepaliData] = await Promise.all([
          getJSON(`/api/admin/cms/articles/${id}`),
          getJSON(`/api/admin/cms/translations/${id}`)
        ]);

        const english = englishData.article;
        const nepali = nepaliData.translation;

        if (!english) {
          throw new Error('English source article not found.');
        }

        if (
          nepali &&
          !['draft', 'changes_requested'].includes(
            nepali.translation_status
          )
        ) {
          throw new Error(
            'This Nepali translation is locked for editorial review.'
          );
        }

        clearForm();

        editingId = english.id;

        slugField.value = english.slug || '';
        categoryField.value = english.category || 'FARM STORIES';

        titleField.value = nepali?.title || '';
        excerptField.value = nepali?.excerpt || '';
        seoTitleField.value = nepali?.seo_title || '';
        seoDescriptionField.value = nepali?.seo_description || '';

        setLanguage('ne');

        if (nepali?.content_json) {
          editor.commands.setContent(nepali.content_json);
        } else {
          editor.commands.clearContent();
        }

        form.hidden = false;
        saveButton.textContent = 'Save Nepali draft';

        showStatus(
          nepaliData.exists
            ? `Editing Nepali translation for article #${editingId}.`
            : `Creating Nepali translation for article #${editingId}.`
        );

        form.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });

        titleField.focus();

      } catch (error) {
        console.error('Nepali draft loading failed:', error);
        showStatus(error.message, true);

      } finally {
        loading = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

    async function submitNepaliForReview(id) {
      if (saving || loading || submittingReview) return;

      const confirmed = window.confirm(
        `Submit the saved Nepali draft for article #${id} for review? ` +
        'It will be locked for editing until changes are requested.'
      );

      if (!confirmed) return;

      submittingReview = true;
      newButton.disabled = true;

      showStatus(`Submitting Nepali translation for article #${id}...`);

      try {
        const response = await fetch(
          `/api/admin/cms/translations/${id}/submit`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            }
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Unable to submit for review.');
        }

        // Close any editor for the submitted article: it is now locked.
        if (editingId === id && editingLanguage === 'ne') {
          clearForm();
          form.hidden = true;
          saveButton.disabled = true;
        }

        await loadArticles();

        showStatus(
          `Nepali article #${id} submitted for review ` +
          `(revision #${result.revision_number}).`
        );

      } catch (error) {
        console.error('Nepali review submission failed:', error);
        showStatus(error.message, true);

      } finally {
        submittingReview = false;
        newButton.disabled = false;
      }
    }

    async function loadArticles() {
      try {
        const data = await getJSON('/api/admin/cms/articles');

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
            `${title} — ${article.slug} (${article.english_status || article.legacy_status}) `;

          item.appendChild(label);

          if (
            article.english_translation_id &&
            article.legacy_status === 'draft'
          ) {
            const englishButton = document.createElement('button');
            englishButton.type = 'button';
            englishButton.textContent = 'Edit English';

            englishButton.addEventListener('click', () => {
              openExistingDraft(article.id);
            });

            item.appendChild(englishButton);

            const nepaliButton = document.createElement('button');
            nepaliButton.type = 'button';

            const nepaliStatus = article.nepali_status || 'draft';

            if (!article.nepali_translation_id) {
              nepaliButton.textContent = 'Add Nepali';
            } else if (
              !['draft', 'changes_requested'].includes(nepaliStatus)
            ) {
              nepaliButton.textContent = 'Nepali locked';
              nepaliButton.disabled = true;
            } else {
              nepaliButton.textContent = 'Edit Nepali';
            }

            if (!nepaliButton.disabled) {
              nepaliButton.addEventListener('click', () => {
                openNepaliDraft(article.id);
              });
            }

            item.appendChild(nepaliButton);

            if (article.nepali_translation_id) {
              const translationStatus = document.createElement('span');
              translationStatus.textContent =
                ` Nepali: ${nepaliStatus}`;

              item.appendChild(translationStatus);

              if (nepaliStatus === 'draft') {
                const submitButton = document.createElement('button');
                submitButton.type = 'button';
                submitButton.textContent = 'Submit for Review';

                submitButton.addEventListener('click', () => {
                  submitNepaliForReview(article.id);
                });

                item.appendChild(submitButton);
              }
            }
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

      if (saving || loading || submittingReview) return;
      if (!form.reportValidity()) return;

      if (editor.isEmpty) {
        showStatus('Please enter article content.', true);
        editor.commands.focus();
        return;
      }

      const isNepali = editingLanguage === 'ne';
      const isEditing = editingId !== null;
      const targetId = editingId;

      const payload = {
        title: titleField.value.trim(),
        excerpt: excerptField.value.trim(),
        seo_title: seoTitleField.value.trim(),
        seo_description: seoDescriptionField.value.trim(),
        content_json: editor.getJSON()
      };

      if (!isNepali) {
        payload.category = categoryField.value.trim();

        if (!isEditing) {
          payload.slug = slugField.value.trim();
        }
      }

      saving = true;
      saveButton.disabled = true;
      newButton.disabled = true;

      showStatus(
        isNepali
          ? 'Saving Nepali translation...'
          : isEditing
            ? 'Updating English draft...'
            : 'Saving English draft...'
      );

      try {
        let url;
        let method;

        if (isNepali) {
          url = `/api/admin/cms/translations/${targetId}`;
          method = 'PUT';
        } else if (isEditing) {
          url = `/api/admin/cms/articles/${targetId}`;
          method = 'PUT';
        } else {
          url = '/api/admin/cms/articles';
          method = 'POST';
        }

        const response = await fetch(url, {
          method,
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

        const savedId = isEditing ? targetId : result.id;
        const savedLanguage = isNepali ? 'Nepali' : 'English';

        clearForm();
        form.hidden = true;

        showStatus(
          `${savedLanguage} draft #${savedId} saved successfully.`
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

    console.log('Anju Farm bilingual TipTap CMS initialized.');

  } catch (error) {
    console.error('TipTap initialization failed:', error);
  }
}
