import { Editor, StarterKit } from './tiptap-bundle.js';

const section = document.getElementById('cms-section');
const mount = document.getElementById('cms-rich-editor');
const toolbar = document.getElementById('cms-toolbar');

if (!section || !mount || !toolbar) {
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
      content: '<p>Start writing your article here.</p>'
    });

    const controls = [
      ['Bold', 'bold', () => editor.chain().focus().toggleBold().run()],
      ['Italic', 'italic', () => editor.chain().focus().toggleItalic().run()],
      ['H2', 'heading', () => editor.chain().focus().toggleHeading({ level: 2 }).run()],
      ['H3', 'heading', () => editor.chain().focus().toggleHeading({ level: 3 }).run()],
      ['Bullet list', 'bulletList', () => editor.chain().focus().toggleBulletList().run()],
      ['Numbered list', 'orderedList', () => editor.chain().focus().toggleOrderedList().run()],
      ['Quote', 'blockquote', () => editor.chain().focus().toggleBlockquote().run()],
      ['Undo', 'undo', () => editor.chain().focus().undo().run()],
      ['Redo', 'redo', () => editor.chain().focus().redo().run()]
    ];

    for (const [label, name, action] of controls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.action = name;
      button.addEventListener('click', action);
      toolbar.appendChild(button);
    }

    // Temporarily display the editor for formatting tests.
    // Saving remains disabled until API integration.
    const form = document.getElementById('cms-form');
const newButton = document.getElementById('cms-new');
const saveButton = document.getElementById('cms-save');

form.hidden = true;
newButton.disabled = false;
saveButton.disabled = true;

newButton.addEventListener('click', () => {
  // Clear all fields from the previous article.
  form.reset();

  // Clear the rich-text editor.
  editor.commands.clearContent();

  // Show the form for a new English draft.
  form.hidden = false;

  // Focus the article title.
  document.getElementById('cms-title').focus();

  console.log('New English draft form opened.');
});

    console.log('Anju Farm TipTap editor initialized.');
  } catch (error) {
    console.error('TipTap initialization failed:', error);
  }
}
