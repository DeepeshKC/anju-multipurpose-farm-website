
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
      if (saving || loading || submittingReview) return;

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
      if (saving || loading || submittingReview) return;

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