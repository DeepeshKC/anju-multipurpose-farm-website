import { Editor, StarterKit } from 'https://esm.sh/@tiptap/starter-kit@3.31.3?bundle';

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
    document.getElementById('cms-form').hidden = false;
    document.getElementById('cms-new').disabled = true;
    document.getElementById('cms-save').disabled = true;

    console.log('Anju Farm TipTap editor initialized.');
  } catch (error) {
    console.error('TipTap initialization failed:', error);
  }
}
