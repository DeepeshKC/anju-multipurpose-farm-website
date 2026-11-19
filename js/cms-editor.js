
import { Editor, StarterKit, Node } from './tiptap-bundle.js';

const FarmImage = Node.create({
  name: 'farmImage', group: 'block', atom: true, selectable: true,
  addAttributes() { return {
    src: { default: null }, alt: { default: '' }, caption: { default: '' }, mediaId: { default: null }
  }; },
  parseHTML() { return [{ tag: 'figure[data-farm-image]' }]; },
  renderHTML({ HTMLAttributes: a }) { return ['figure', { 'data-farm-image': '' },
    ['img', { src: a.src, alt: a.alt, loading: 'lazy' }],
    ['figcaption', {}, a.caption || '']
  ]; }
});

const section = document.getElementById('cms-section');
const mount = document.getElementById('cms-rich-editor');
const toolbar = document.getElementById('cms-toolbar');
const form = document.getElementById('cms-form');
const newButton = document.getElementById('cms-new');
const saveButton = document.getElementById('cms-save');
const previewButton = document.getElementById('cms-preview');
const cancelButton = document.getElementById('cms-cancel');
const articlesList = document.getElementById('cms-articles-list');

if (!section || !mount || !toolbar || !form ||
    !newButton || !saveButton || !previewButton || !cancelButton || !articlesList) {
  console.error('CMS editor HTML elements are missing.');
} else {
  try {
    const editor = new Editor({
      element: mount,
      extensions: [
        FarmImage,
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: false,
          codeBlock: false
        })
      ],
      content: '<p></p>'
    });

      const wordCounter = document.createElement('p');
wordCounter.id = 'cms-word-count';
wordCounter.className = 'admin-note';
wordCounter.setAttribute('aria-live', 'off');
mount.after(wordCounter);

function updateWordCount() {
  const text = editor.getText().trim();
  const words = text ? text.split(/\s+/u).length : 0;
  const characters = [...text].length;

  wordCounter.textContent =
    `${words} words · ${characters} characters`;
}

editor.on('update', updateWordCount);
updateWordCount();
      
    const controls = [
  ['Paragraph', () => editor.chain().focus().setParagraph().run()],
  ['H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
  ['H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
  ['Bold', () => editor.chain().focus().toggleBold().run()],
  ['Italic', () => editor.chain().focus().toggleItalic().run()],
  ['Bullet list', () => editor.chain().focus().toggleBulletList().run()],
  ['Numbered list', () => editor.chain().focus().toggleOrderedList().run()],
  ['Quote', () => editor.chain().focus().toggleBlockquote().run()],
  ['Clear formatting', () => editor.chain().focus().clearNodes().unsetAllMarks().run()],
  ['Undo', () => editor.chain().focus().undo().run()],
  ['Redo', () => editor.chain().focus().redo().run()]
];

    controls.splice(8, 0, ['Insert image', async () => {
      const choice = window.prompt('Enter the media ID from your uploaded images (see Media uploads below):');
      if (choice === null) return;
      const id = Number(choice);
      if (!Number.isSafeInteger(id) || id < 1) { window.alert('Enter a valid media ID.'); return; }
      try {
        const response = await fetch('/api/admin/media', { credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load media');
        const media = (data.items || []).find(item => item.id === id);
        if (!media) throw new Error('Media ID not found in staging library');
        const ne = editingLanguage === 'ne';
        editor.chain().focus().insertContent({ type: 'farmImage', attrs: {
          src: media.secure_url, mediaId: media.id,
          alt: (ne ? media.alt_ne : media.alt_en) || '',
          caption: (ne ? media.caption_ne : media.caption_en) || ''
        } }).run();
      } catch (error) { window.alert(error.message); }
    }]);
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
    let savedEditorSnapshot = null;

    function currentEditorSnapshot() {
      return JSON.stringify({
        title: titleField.value,
        slug: slugField.value,
        category: categoryField.value,
        excerpt: excerptField.value,
        seoTitle: seoTitleField.value,
        seoDescription: seoDescriptionField.value,
        content: editor.getJSON()
      });
    }

    function recordEditorSnapshot() {
      savedEditorSnapshot = currentEditorSnapshot();
    }

    function closeEditor() {
      if (saving || loading || submittingReview || publishing || form.hidden) return;
      if (savedEditorSnapshot !== null &&
          currentEditorSnapshot() !== savedEditorSnapshot &&
          !window.confirm('Discard unsaved changes and return to the article list?')) {
        return;
      }
      clearForm();
      form.hidden = true;
      saveButton.disabled = true;
      previewButton.disabled = true;
      showStatus('Editor closed. No changes were saved.');
      articlesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // TipTap StarterKit produces a limited set of nodes. Rebuild preview HTML
    // from a strict allowlist rather than trusting arbitrary HTML strings.
    function safePreviewHtml(rawHtml) {
      const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
      const allowed = new Set([
        'P', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL',
        'LI', 'BLOCKQUOTE', 'BR', 'HR', 'S', 'DEL', 'FIGURE', 'IMG', 'FIGCAPTION'
      ]);
      function copyNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        const fragment = document.createDocumentFragment();
        const destination = allowed.has(node.tagName)
          ? document.createElement(node.tagName.toLowerCase()) : fragment;
        if (node.tagName === 'IMG') {
          const src = node.getAttribute('src') || '';
          if (!/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//.test(src)) return fragment;
          destination.setAttribute('src', src);
          destination.setAttribute('alt', node.getAttribute('alt') || '');
          destination.setAttribute('loading', 'lazy');
        }
        for (const child of node.childNodes) destination.appendChild(copyNode(child));
        return destination;
      }
      const holder = document.createElement('div');
      for (const node of parsed.body.childNodes) holder.appendChild(copyNode(node));
      return holder.innerHTML;
    }

    function escapePreviewText(value) {
      return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[character]);
    }

    function previewArticle() {
      if (form.hidden || saving || loading || submittingReview || publishing) return;
      const language = editingLanguage === 'ne' ? 'ne' : 'en';
      const title = escapePreviewText(titleField.value.trim() || 'Untitled draft');
      const category = escapePreviewText(categoryField.value.trim());
      const excerpt = escapePreviewText(excerptField.value.trim());
      const content = safePreviewHtml(editor.getHTML());
      const html = `<!doctype html><html lang="${language}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>Draft Preview — ${title}</title>
<style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f8f6ef;color:#252c24;font:17px/1.75 Georgia,serif}
header{padding:12px 5%;background:#6b342d;color:white;font:600 13px/1.4 Arial,sans-serif;letter-spacing:.06em}
main{max-width:850px;margin:44px auto;padding:0 24px 80px}.category{font:600 12px/1.5 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#7c6251}
h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.2;margin:12px 0 20px}.excerpt{font-size:1.15rem;color:#586052}
.article{margin-top:32px}.article h2,.article h3,.article h4{line-height:1.3;margin-top:1.8em}.article blockquote{border-left:4px solid #9b7453;padding-left:18px;margin-left:0;color:#555}
.article p{margin:1em 0}.article li{margin:.3em 0}
</style></head><body><header>DRAFT PREVIEW — NOT PUBLISHED · ${language === 'ne' ? 'NEPALI' : 'ENGLISH'}</header>
<main><div class="category">${category}</div><h1>${title}</h1><p class="excerpt">${excerpt}</p>
<div class="article">${content}</div></main></body></html>`;
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const tab = window.open(blobUrl, '_blank');
      if (tab) tab.opener = null;
      else showStatus('Preview was blocked. Please allow pop-ups for staging.', true);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }


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
      if (saving || loading || submittingReview || publishing) return;

      clearForm();
      recordEditorSnapshot();

      form.hidden = false;
      saveButton.disabled = false;
      previewButton.disabled = false;
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
      if (saving || loading || submittingReview || publishing) return;

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
        recordEditorSnapshot();
        saveButton.textContent = 'Update English draft';
        previewButton.disabled = false;

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
      if (saving || loading || submittingReview || publishing) return;

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
        recordEditorSnapshot();
        saveButton.textContent = 'Save Nepali draft';
        previewButton.disabled = false;

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
      if (saving || loading || submittingReview || publishing) return;

      if (!window.confirm(
        `Submit the saved Nepali draft for article #${id} for review? ` +
        'It will be locked for editing until changes are requested.'
      )) return;

      submittingReview = true;
      newButton.disabled = true;
      saveButton.disabled = true;
      showStatus(`Submitting Nepali translation for article #${id}...`);

      try {
        const response = await fetch(
          `/api/admin/cms/translations/${id}/submit`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }
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
        saveButton.disabled = form.hidden;
      }
    }

    async function toggleReviewHistory(id, button, panel) {
      if (!panel.hidden) {
        panel.hidden = true;
        button.textContent = 'Review History';
        return;
      }

      button.disabled = true;
      panel.hidden = false;
      panel.replaceChildren();
      const loadingText = document.createElement('p');
      loadingText.textContent = 'Loading review history...';
      panel.appendChild(loadingText);

      try {
        const data = await getJSON(
          `/api/admin/cms/translations/${id}/reviews`
        );
        panel.replaceChildren();

        const heading = document.createElement('h4');
        heading.textContent = `Nepali review history — article #${id}`;
        panel.appendChild(heading);

        const status = document.createElement('p');
        status.textContent = `Current status: ${data.translation_status}`;
        panel.appendChild(status);

        if (!data.revisions || data.revisions.length === 0) {
          const empty = document.createElement('p');
          empty.textContent = 'No submitted revisions yet.';
          panel.appendChild(empty);
        } else {
          const historyList = document.createElement('ol');
          for (const revision of data.revisions) {
            const entry = document.createElement('li');
            const decision = revision.review?.decision || 'Awaiting review';
            const date = revision.created_at || 'Date unavailable';

            const summary = document.createElement('strong');
            summary.textContent =
              `Revision #${revision.revision_number} — ${decision}`;
            entry.appendChild(summary);

            const details = document.createElement('p');
            details.textContent = `Submitted: ${date}`;
            entry.appendChild(details);

            if (revision.review?.reviewed_at) {
              const reviewed = document.createElement('p');
              reviewed.textContent =
                `Reviewed: ${revision.review.reviewed_at}`;
              entry.appendChild(reviewed);
            }

            if (revision.review?.notes) {
              const notes = document.createElement('p');
              notes.textContent = `Feedback: ${revision.review.notes}`;
              entry.appendChild(notes);
            }

            historyList.appendChild(entry);
          }
          panel.appendChild(historyList);
        }
        button.textContent = 'Hide Review History';
      } catch (error) {
        console.error('Review history loading failed:', error);
        panel.replaceChildren();
        const message = document.createElement('p');
        message.textContent = `Unable to load review history: ${error.message}`;
        message.className = 'admin-error';
        panel.appendChild(message);
        button.textContent = 'Review History';
      } finally {
        button.disabled = false;
      }
    }

      
    async function approveNepaliTranslation(id) {
      if (saving || loading || submittingReview || publishing) return;

      submittingReview = true;
      newButton.disabled = true;
      saveButton.disabled = true;

      try {
        // Retrieve the current revision from the server.
        const history = await getJSON(
          `/api/admin/cms/translations/${id}/reviews`
        );

        if (
          history.translation_status !== 'in_review' ||
          !Number.isSafeInteger(history.current_revision_id)
        ) {
          throw new Error(
            'No Nepali revision is currently awaiting approval.'
          );
        }

        const revisionId = history.current_revision_id;

        const currentRevision = history.revisions.find(
          revision => revision.revision_id === revisionId
        );

        if (!currentRevision || currentRevision.review) {
          throw new Error(
            'The current revision is not available for approval.'
          );
        }

        const confirmed = window.confirm(
          `Approve Nepali translation for article #${id}?\n\n` +
          `Revision: #${currentRevision.revision_number}\n\n` +
          'This will mark the translation as approved and ' +
          'keep it locked for editing.\n\n' +
          'The article will NOT be published.'
        );

        if (!confirmed) return;

        showStatus(
          `Approving Nepali revision #${currentRevision.revision_number}...`
        );

        const response = await fetch(
          `/api/admin/cms/translations/${id}/approve`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              revision_id: revisionId
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || 'Unable to approve Nepali translation.'
          );
        }

        if (editingId === id && editingLanguage === 'ne') {
          clearForm();
          form.hidden = true;
        }

        await loadArticles();

        showStatus(
          `Nepali translation for article #${id} approved successfully ` +
          `(revision #${currentRevision.revision_number}).`
        );

        console.log('Nepali translation approved:', result);

      } catch (error) {
        console.error('Nepali approval failed:', error);
        showStatus(error.message, true);

      } finally {
        submittingReview = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

    async function requestNepaliChanges(id) {
      if (saving || loading || submittingReview || publishing) return;

      submittingReview = true;
      newButton.disabled = true;
      saveButton.disabled = true;

      try {
        // Retrieve the revision currently awaiting review.
        const history = await getJSON(
          `/api/admin/cms/translations/${id}/reviews`
        );

        if (
          history.translation_status !== 'in_review' ||
          !Number.isSafeInteger(history.current_revision_id)
        ) {
          throw new Error(
            'No Nepali revision is currently awaiting review.'
          );
        }

        const revisionId = history.current_revision_id;

        const currentRevision = history.revisions.find(
          revision => revision.revision_id === revisionId
        );

        if (!currentRevision || currentRevision.review) {
          throw new Error(
            'The current revision is not available for review.'
          );
        }

        const notes = window.prompt(
          `Request changes for article #${id}\n` +
          `Nepali revision #${currentRevision.revision_number}\n\n` +
          'Explain the corrections required:'
        );

        // Cancel means no changes are requested.
        if (notes === null) return;

        const feedback = notes.trim();

        if (!feedback) {
          showStatus(
            'Review feedback is required to request changes.',
            true
          );
          return;
        }

        if (feedback.length > 2000) {
          showStatus(
            'Review feedback must be 2000 characters or fewer.',
            true
          );
          return;
        }

        const confirmed = window.confirm(
          `Request changes to Nepali revision ` +
          `#${currentRevision.revision_number}?\n\n` +
          `Feedback:\n${feedback}\n\n` +
          'The translation will be unlocked for editing. ' +
          'The article will remain unpublished.'
        );

        if (!confirmed) return;

        showStatus(
          `Requesting changes for Nepali revision ` +
          `#${currentRevision.revision_number}...`
        );

        const response = await fetch(
          `/api/admin/cms/translations/${id}/request-changes`,
          {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              revision_id: revisionId,
              notes: feedback
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || 'Unable to request Nepali changes.'
          );
        }

        await loadArticles();

        showStatus(
          `Changes requested for Nepali article #${id} ` +
          `(revision #${currentRevision.revision_number}). ` +
          'The translation can now be edited.'
        );

        console.log('Nepali changes requested:', result);

      } catch (error) {
        console.error('Nepali change request failed:', error);
        showStatus(error.message, true);

      } finally {
        submittingReview = false;
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

      
    // Publication uses the last saved snapshot, never unsaved editor changes.
    let publishing = false;
    const publicationButtons = new Set();

    function setPublicationBusy(busy) {
      for (const button of publicationButtons) {
        if (!button.isConnected) {
          publicationButtons.delete(button);
          continue;
        }
        button.disabled = busy;
      }
    }

    function publicationDetail(revision) {
      if (!revision) return '';
      const parts = [];
      if (revision.revision_id != null) parts.push(`revision #${revision.revision_id}`);
      if (revision.language_published_at) {
        parts.push(`server time: ${revision.language_published_at} UTC`);
      }
      return parts.length ? ` (${parts.join(' · ')})` : '';
    }

    async function publishArticle(id, language) {
      if (saving || loading || submittingReview || publishing) return;

      const isNepali = language === 'ne';
      const name = isNepali ? 'Nepali' : 'English';
      const endpoint = isNepali
        ? `/api/admin/cms/translations/${id}/publish`
        : `/api/admin/cms/articles/${id}/publish`;

      const warning = editingId === id && !form.hidden
        ? '\n\nYou have an editor open. Unsaved changes will NOT be published.'
        : '';

      const confirmed = window.confirm(
        `Publish the last saved ${name} version of article #${id}?` +
        warning +
        '\n\nOnly the last saved version is published. Continue?'
      );
      if (!confirmed) return;

      publishing = true;
      setPublicationBusy(true);
      newButton.disabled = true;
      saveButton.disabled = true;
      showStatus(`Publishing ${name} article #${id}...`);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || `Unable to publish ${name}.`);
        }
        await loadArticles();
        showStatus(`${name} article #${id} published successfully${publicationDetail(result.published)}.`);
        // Keep the result visible after the article list refreshes.
        statusMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        console.error(`${name} publication failed:`, error);
        showStatus(error.message, true);
      } finally {
        publishing = false;
        setPublicationBusy(false);
        newButton.disabled = false;
        saveButton.disabled = form.hidden;
      }
    }

    async function loadArticles() {
      try {
        const data = await getJSON('/api/admin/cms/articles');

        articlesList.replaceChildren();
        publicationButtons.clear();

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
          const englishPublished = article.english_published_revision_id != null;
          const nepaliPublished = article.nepali_published_revision_id != null;
          label.textContent =
            `${title} — ${article.slug} ` +
            `(English: ${englishPublished ? 'Published' : 'Not published'}; ` +
            `Nepali: ${nepaliPublished ? 'Published' : 'Not published'}) `;

          item.appendChild(label);

          const publicationMeta = document.createElement('small');
          publicationMeta.className = 'cms-publication-meta';
          const englishInfo = englishPublished
            ? `English published: revision #${article.english_published_revision_id}` +
              (article.english_published_at ? ` · ${article.english_published_at} UTC` : '')
            : 'English not published';
          const nepaliInfo = nepaliPublished
            ? `Nepali published: revision #${article.nepali_published_revision_id}` +
              (article.nepali_published_at ? ` · ${article.nepali_published_at} UTC` : '')
            : 'Nepali not published';
          publicationMeta.textContent = `${englishInfo} | ${nepaliInfo}`;
          publicationMeta.style.display = 'block';
          publicationMeta.style.margin = '4px 0 8px';
          item.appendChild(publicationMeta);

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

            const publishEnglishButton = document.createElement('button');
            publishEnglishButton.type = 'button';
            publishEnglishButton.textContent = englishPublished
              ? 'Publish English update'
              : 'Publish English';
            publishEnglishButton.setAttribute('aria-label',
              `Publish saved English draft for article #${article.id}`);
            publishEnglishButton.addEventListener('click', () => {
              publishArticle(article.id, 'en');
            });
            publicationButtons.add(publishEnglishButton);
            item.appendChild(publishEnglishButton);

            const nepaliButton = document.createElement('button');
            nepaliButton.type = 'button';
            nepaliButton.textContent = article.nepali_translation_id
              ? 'Edit Nepali'
              : 'Add Nepali';

            nepaliButton.addEventListener('click', () => {
              openNepaliDraft(article.id);
            });

            // Translations under review or approved cannot be edited.
            const nepaliStatus = article.nepali_status || 'draft';
            if (article.nepali_translation_id &&
                !['draft', 'changes_requested'].includes(nepaliStatus)) {
              nepaliButton.textContent = 'Nepali locked';
              nepaliButton.disabled = true;
            }

            item.appendChild(nepaliButton);

            if (article.nepali_translation_id && nepaliStatus === 'draft') {
              const submitButton = document.createElement('button');
              submitButton.type = 'button';
              submitButton.textContent = 'Submit for Review';
              submitButton.addEventListener('click', () => {
                submitNepaliForReview(article.id);
              });
              item.appendChild(submitButton);
            }

            if (article.nepali_translation_id) {
              const translationStatus = document.createElement('span');
              translationStatus.textContent =
                ` Nepali: ${article.nepali_status || 'draft'}`;

              item.appendChild(translationStatus);

              // Source consistency is separate from editorial approval.
              const sourceLabels = {
                current: 'Current',
                outdated: 'Outdated — revalidation required',
                unverified: 'Unverified — revalidation required',
                pending_review: 'Pending review',
                not_approved: 'Not approved',
                not_started: 'Not started'
              };
              const sourceStatus = article.nepali_source_status;
              const sourceText = sourceLabels[sourceStatus] || 'Unknown';
              const sourceLabel = document.createElement('span');
              sourceLabel.textContent = ` | Source consistency: ${sourceText}`;
              sourceLabel.setAttribute('aria-label',
                `Nepali source consistency: ${sourceText}`);
              item.appendChild(sourceLabel);

              if (nepaliStatus === 'approved' && sourceStatus === 'current') {
                const publishNepaliButton = document.createElement('button');
                publishNepaliButton.type = 'button';
                publishNepaliButton.textContent = nepaliPublished
                  ? 'Publish Nepali update'
                  : 'Publish Nepali';
                publishNepaliButton.setAttribute('aria-label',
                  `Publish approved Nepali revision for article #${article.id}`);
                publishNepaliButton.addEventListener('click', () => {
                  publishArticle(article.id, 'ne');
                });
                publicationButtons.add(publishNepaliButton);
                item.appendChild(publishNepaliButton);
              }

              const historyButton = document.createElement('button');
              historyButton.type = 'button';
              historyButton.textContent = 'Review History';
              historyButton.setAttribute(
                'aria-label', `Review history for article #${article.id}`
              );

              const historyPanel = document.createElement('div');
              historyPanel.hidden = true;
              historyPanel.className = 'cms-review-history';
              historyButton.addEventListener('click', () => {
                toggleReviewHistory(article.id, historyButton, historyPanel);
              });
              item.appendChild(historyButton);
              item.appendChild(historyPanel);
                
              // Approval is available only for submitted
              // Nepali translations awaiting review.
              if (nepaliStatus === 'in_review') {
                const approveButton = document.createElement('button');

                approveButton.type = 'button';
                approveButton.textContent = 'Approve Nepali';
                approveButton.setAttribute(
                  'aria-label',
                  `Approve Nepali translation for article #${article.id}`
                );

                approveButton.addEventListener('click', async () => {
                  if (approveButton.disabled) return;

                  approveButton.disabled = true;

                  try {
                    await approveNepaliTranslation(article.id);
                  } finally {
                    if (approveButton.isConnected) {
                      approveButton.disabled = false;
                    }
                  }
                });

                item.appendChild(approveButton);
              }

              // Allow corrections to be requested only
              // while a Nepali revision is in review.
              if (nepaliStatus === 'in_review') {
                const changesButton = document.createElement('button');

                changesButton.type = 'button';
                changesButton.textContent = 'Request Changes';
                changesButton.setAttribute(
                  'aria-label',
                  `Request Nepali changes for article #${article.id}`
                );

                changesButton.addEventListener('click', async () => {
                  if (changesButton.disabled) return;

                  changesButton.disabled = true;

                  try {
                    await requestNepaliChanges(article.id);
                  } finally {
                    if (changesButton.isConnected) {
                      changesButton.disabled = false;
                    }
                  }
                });

                item.appendChild(changesButton);
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
    previewButton.disabled = true;
    cancelButton.addEventListener('click', closeEditor);
    previewButton.addEventListener('click', previewArticle);

    newButton.addEventListener('click', openNewDraft);

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (saving || loading || submittingReview || publishing) return;
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