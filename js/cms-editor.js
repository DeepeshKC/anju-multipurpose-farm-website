function safeArticleLink(raw) {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && u.hostname && !u.username && !u.password) return u.href;
    if (u.protocol === 'mailto:' && /^mailto:[^\s@?]+@[^\s@?]+(?:\?[^\s]*)?$/i.test(raw)) return raw;
  } catch (_) {}
  return null;
}


import { Editor, StarterKit, Node } from './tiptap-bundle.js';

// Web-document paragraph layout attributes persist in TipTap JSON.
const ArticleLayout = Node.create({
  name: 'articleLayout',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading'], attributes: {
      textAlign: { default: 'left', parseHTML: el => ['left','center','right','justify'].includes(el.style.textAlign) ? el.style.textAlign : 'left', renderHTML: a => ({style: `text-align:${a.textAlign || 'left'}`}) },
      lineHeight: { default: '1.65', parseHTML: el => ['1.2','1.4','1.65','2'].includes(el.style.lineHeight) ? el.style.lineHeight : '1.65', renderHTML: a => ({style: `line-height:${a.lineHeight || '1.65'}`}) },
      indent: { default: 0, parseHTML: el => Math.min(4,Math.max(0,parseInt(el.dataset.indent || '0',10)||0)), renderHTML: a => ({'data-indent': String(a.indent || 0), style: `margin-left:${(a.indent || 0)*1.5}rem`}) }
    }}];
  }
});

// Word-style image node: interactive NodeView, persisted in article JSON.
const FarmImage = Node.create({
  name: 'farmImage', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return {
    src: { default: null }, alt: { default: '' }, caption: { default: '' }, mediaId: { default: null },
    size: { default: 'large' }, align: { default: 'center' }, widthPct: { default: 100 },
    wrap: { default: 'none' }, crop: { default: 100 }, cropX: { default: 50 }, cropY: { default: 50 }, rotation: { default: 0 }
  }; },
  parseHTML() { return [{ tag: 'figure[data-farm-image]', getAttrs: el => ({
    src: el.querySelector('img')?.getAttribute('src'), alt: el.querySelector('img')?.getAttribute('alt') || '',
    caption: el.querySelector('figcaption')?.textContent || '', mediaId: Number(el.dataset.mediaId) || null,
    size: el.dataset.size || 'large', align: el.dataset.align || 'center',
    widthPct: Number(el.dataset.widthPct) || 100, wrap: el.dataset.wrap || 'none',
    crop: Number(el.dataset.crop) || 100, cropX: Number(el.dataset.cropX) || 50,
    cropY: Number(el.dataset.cropY) || 50, rotation: Number(el.dataset.rotation) || 0
  }) }]; },
  renderHTML({ HTMLAttributes: a }) { return ['figure', {
    'data-farm-image': '', 'data-media-id': a.mediaId, 'data-size': a.size, 'data-align': a.align,
    'data-width-pct': a.widthPct, 'data-wrap': a.wrap, 'data-crop': a.crop,
    'data-crop-x': a.cropX, 'data-crop-y': a.cropY, 'data-rotation': a.rotation,
    class: `farm-inline-image farm-size-${a.size} farm-align-${a.align} farm-wrap-${a.wrap}`,
    style: `--farm-width:${a.widthPct}%;--farm-crop:${a.crop}%;--farm-crop-x:${a.cropX}%;--farm-crop-y:${a.cropY}%;--farm-rotation:${a.rotation || 0}deg`
  }, ['div', { class: 'farm-image-window' }, ['img', { src: a.src, alt: a.alt, loading: 'lazy' }]],
    ['figcaption', {}, a.caption || '']]; },
  addNodeView() { return ({ node, getPos, editor }) => {
    let current = node;
    const figure = document.createElement('figure');
    figure.dataset.farmImage = '';
    figure.className = 'farm-inline-image farm-editable-image';
    figure.draggable = true;
    const windowEl = document.createElement('div'); windowEl.className = 'farm-image-window';
    const img = document.createElement('img'); img.draggable = false;
    const caption = document.createElement('figcaption');
    const handles = ['nw','n','ne','e','se','s','sw','w'].map(direction => {
      const handle = document.createElement('span');
      handle.className = `farm-handle farm-handle-${direction}`;
      handle.dataset.direction = direction;
      handle.title = `Resize image (${direction})`;
      handle.contentEditable = 'false';
      return handle;
    });
    const rotate = document.createElement('button'); rotate.type='button';
    rotate.className='farm-rotate-button'; rotate.textContent='↻ Rotate 90°';
    rotate.title='Rotate image 90 degrees'; rotate.contentEditable='false';
    const move = document.createElement('span'); move.className='farm-drag-label';
    move.textContent='⠿ Drag to reposition'; move.contentEditable='false'; move.draggable=true;
    windowEl.append(img, ...handles, rotate); figure.append(move, windowEl, caption);
    // Deterministic pointer-based block movement. Native HTML drag-and-drop is
    // unreliable for custom ProseMirror NodeViews (especially nested handles).
    // Move only on release, so selection and image sizing stay responsive.
    figure.draggable = false;
    move.draggable = false;
    move.setAttribute('role', 'button');
    move.setAttribute('tabindex', '0');
    move.setAttribute('aria-label', 'Drag image to a new paragraph position');
    let activeMove = null;
    const marker = document.createElement('div');
    marker.className = 'farm-drop-indicator';
    marker.setAttribute('aria-hidden', 'true');
    const clearMove = () => {
      window.removeEventListener('pointermove', onMovePointer, true);
      window.removeEventListener('pointerup', onMoveRelease, true);
      window.removeEventListener('pointercancel', onMoveCancel, true);
      marker.remove();
      figure.classList.remove('farm-is-dragging');
      activeMove = null;
    };
    const dropBoundary = (x, y) => {
      const view = editor.view;
      const hit = view.posAtCoords({left:x, top:y});
      if (!hit) return null;
      const $hit = view.state.doc.resolve(hit.pos);
      if ($hit.depth < 1) return null;
      const blockPos = $hit.before(1);
      const block = $hit.node(1);
      const dom = view.nodeDOM(blockPos);
      const rect = dom?.getBoundingClientRect?.();
      // A text cursor inside a top-level paragraph or heading is a valid
      // insertion point. ProseMirror will split that block when the block
      // image is inserted; the text on either side remains in order.
      if ($hit.depth === 1 && block.isTextblock && rect) {
        const caret = view.coordsAtPos(hit.pos);
        return {boundary:hit.pos, rect, caret, insideText:true};
      }
      // Lists, quotes, existing images and other nested blocks retain the
      // safe before/after behavior to avoid corrupting their structure.
      const after = rect ? y > rect.top + rect.height / 2 : hit.pos > blockPos + block.nodeSize / 2;
      return {boundary:blockPos + (after ? block.nodeSize : 0), rect, after, insideText:false};
    };
    const onMovePointer = e => {
      if (!activeMove || e.pointerId !== activeMove.pointerId) return;
      const target = dropBoundary(e.clientX, e.clientY);
      activeMove.target = target;
      if (!target?.rect) { marker.remove(); return; }
      if (!marker.isConnected) document.body.appendChild(marker);
      if (target.insideText && target.caret) {
        marker.classList.add('farm-drop-indicator-caret');
        marker.style.left = `${target.caret.left}px`;
        marker.style.top = `${target.caret.top}px`;
        marker.style.width = '3px';
        marker.style.height = `${Math.max(16,target.caret.bottom-target.caret.top)}px`;
      } else {
        marker.classList.remove('farm-drop-indicator-caret');
        marker.style.left = `${target.rect.left}px`;
        marker.style.top = `${target.after ? target.rect.bottom : target.rect.top}px`;
        marker.style.width = `${target.rect.width}px`;
        marker.style.height = '0';
      }
    };
    const onMoveRelease = e => {
      if (!activeMove || e.pointerId !== activeMove.pointerId) return;
      const target = dropBoundary(e.clientX, e.clientY) || activeMove.target;
      const from = activeMove.from;
      clearMove();
      if (!target) return;
      const {state, view} = editor;
      const nodeToMove = state.doc.nodeAt(from);
      if (!nodeToMove || nodeToMove.type.name !== 'farmImage') return;
      const end = from + nodeToMove.nodeSize;
      const dest = target.boundary;
      if (dest >= from && dest <= end) return;
      try {
        let tr = state.tr.delete(from, end);
        const mapped = tr.mapping.map(dest);
        // replaceRangeWith fits a block image into the document, splitting a
        // paragraph at the caret if necessary, instead of nesting an image
        // inside paragraph text (which the schema does not permit).
        tr = tr.replaceRangeWith(mapped, mapped, nodeToMove);
        view.dispatch(tr.scrollIntoView());
        view.focus();
      } catch (error) {
        console.warn('Image move could not be completed; article unchanged.', error);
      }
    };
    const onMoveCancel = e => {
      if (activeMove && e.pointerId === activeMove.pointerId) clearMove();
    };
    move.addEventListener('pointerdown', e => {
      if (e.button !== 0 || activeMove) return;
      const from = getPos();
      if (typeof from !== 'number') return;
      e.preventDefault(); e.stopPropagation();
      editor.commands.setNodeSelection(from);
      activeMove = {pointerId:e.pointerId, from, target:null};
      figure.classList.add('farm-is-dragging');
      window.addEventListener('pointermove', onMovePointer, true);
      window.addEventListener('pointerup', onMoveRelease, true);
      window.addEventListener('pointercancel', onMoveCancel, true);
    });
    const updateDisplay = () => {
      const a = current.attrs;
      // Preserve ProseMirror's selection class when updating image attributes.
      // Replacing className here previously hid resize handles after each resize.
      const selected = figure.classList.contains('ProseMirror-selectednode') || figure.dataset.selected === 'true';
      figure.className = `farm-inline-image farm-editable-image farm-size-${a.size} farm-align-${a.align} farm-wrap-${a.wrap}`;
      if (selected) figure.classList.add('ProseMirror-selectednode');
      figure.style.setProperty('--farm-width', `${a.widthPct}%`);
      figure.style.setProperty('--farm-crop', `${a.crop}%`);
      figure.style.setProperty('--farm-crop-x', `${a.cropX}%`);
      figure.style.setProperty('--farm-crop-y', `${a.cropY}%`);
      figure.style.setProperty('--farm-rotation', `${a.rotation || 0}deg`);
      if (img.getAttribute('src') !== (a.src || '')) img.src = a.src || '';
      if (img.alt !== (a.alt || '')) img.alt = a.alt || '';
      if (caption.textContent !== (a.caption || '')) caption.textContent = a.caption || '';
    };
    updateDisplay();
    const updateAttributes = changes => {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {...current.attrs, ...changes}));
      // Attribute changes can clear ProseMirror's node selection. Restore it so
      // resize handles remain visible for repeated adjustments.
      editor.commands.setNodeSelection(pos);
    };
    for (const handle of handles) {
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const direction = handle.dataset.direction;
        const startX = event.clientX, startY = event.clientY;
        const initial = Number(current.attrs.widthPct) || 100;
        const editorWidth = editor.view.dom.clientWidth || 700;
        const bounds = windowEl.getBoundingClientRect();
        const ratio = bounds.width / Math.max(1, bounds.height);
        // Keep the image selected before and throughout the resize gesture.
        const selectedPos = getPos();
        if (typeof selectedPos === 'number') editor.commands.setNodeSelection(selectedPos);
        figure.classList.add('ProseMirror-selectednode');
        handle.setPointerCapture(event.pointerId);
        let lastWidth = initial;
        const onMove = e => {
          const dx = e.clientX-startX, dy = e.clientY-startY;
          const horizontal = direction.includes('e') ? dx : direction.includes('w') ? -dx : 0;
          const vertical = direction.includes('s') ? dy : direction.includes('n') ? -dy : 0;
          const change = direction === 'n' || direction === 's' ? vertical * ratio : horizontal;
          lastWidth = Math.round(Math.max(15, Math.min(100, initial + change*100/editorWidth)));
          figure.style.setProperty('--farm-width', `${lastWidth}%`);
        };
        const finish = e => {
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', finish);
          handle.removeEventListener('pointercancel', finish);
          if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
          if (e.type === 'pointercancel') { updateDisplay(); return; }
          if (lastWidth !== initial) {
            updateAttributes({widthPct: lastWidth});
            figure.dataset.selected = 'true';
            figure.classList.add('ProseMirror-selectednode');
          }
          else if (typeof getPos() === 'number') editor.commands.setNodeSelection(getPos());
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
      });
    }
    // Clicking an already-selected image should not require deselecting first.
    windowEl.addEventListener('pointerdown', e => {
      if (e.target !== img && e.target !== windowEl) return;
      const pos = getPos();
      if (typeof pos === 'number') editor.commands.setNodeSelection(pos);
    });
    rotate.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      updateAttributes({rotation: ((Number(current.attrs.rotation)||0)+90)%360});
    });
    return { dom: figure, update(next) { if (next.type !== current.type) return false; current = next; updateDisplay(); return true; },
      selectNode() { figure.dataset.selected = 'true'; figure.classList.add('ProseMirror-selectednode'); },
      deselectNode() { delete figure.dataset.selected; figure.classList.remove('ProseMirror-selectednode'); },
      stopEvent(e) { return handles.some(h => h === e.target) || e.target === rotate || e.target === move || move.contains(e.target); },
      destroy() { if (activeMove) clearMove(); },
      ignoreMutation() { return true; }
    };
  }; }
});

const section = document.getElementById('cms-section');
const mount = document.getElementById('cms-rich-editor');
// Make saved hyperlinks visible while editing, not only in preview.
const cmsLinkStyle = document.createElement('style');
cmsLinkStyle.textContent = `
  #cms-editor .ProseMirror a[href],
  #cms-editor-mount .ProseMirror a[href],
  .ProseMirror a[href] {
    color: #1769aa;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: text;
  }
`;
document.head.appendChild(cmsLinkStyle);

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
        ArticleLayout,
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: { openOnClick: false, autolink: false },
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
  ['H4', () => editor.chain().focus().toggleHeading({ level: 4 }).run()],
  ['Bold', () => editor.chain().focus().toggleBold().run()],
  ['Italic', () => editor.chain().focus().toggleItalic().run()],
  ['Insert / edit link', () => {
    const current = editor.getAttributes('link').href || '';
    const input = window.prompt('Link URL (https://, /page, or mailto:). Leave blank to remove:', current);
    if (input === null) return;
    if (!input.trim()) { editor.chain().focus().unsetLink().run(); return; }
    const href = safeArticleLink(input.trim());
    if (!href) { window.alert('Only HTTPS, internal /path, and mailto: links are allowed.'); return; }
    if (editor.state.selection.empty && !editor.isActive('link')) { window.alert('Select the text to link first.'); return; }
    editor.chain().focus().extendMarkRange('link').setLink({ href, target: href.startsWith('https:') ? '_blank' : null, rel: 'noopener noreferrer' }).run();
  }],
  ['Remove link', () => editor.chain().focus().unsetLink().run()],
  ['Underline', () => editor.chain().focus().toggleUnderline().run()],
  ['Strike', () => editor.chain().focus().toggleStrike().run()],
  ['Inline code', () => editor.chain().focus().toggleCode().run()],
  ['Bullet list', () => editor.chain().focus().toggleBulletList().run()],
  ['Numbered list', () => editor.chain().focus().toggleOrderedList().run()],
  ['Quote', () => editor.chain().focus().toggleBlockquote().run()],
  ['Divider', () => editor.chain().focus().setHorizontalRule().run()],
  ['Clear formatting', () => editor.chain().focus().clearNodes().unsetAllMarks().run()],
  ['Undo', () => editor.chain().focus().undo().run()],
  ['Redo', () => editor.chain().focus().redo().run()]
];

    // Additional Word-like controls share the SAME article editor and save path.
    // Never overwrite the image NodeView or the existing publishing workflow.
    const ribbon = document.createElement('div');
    ribbon.className = 'cms-word-ribbon';
    ribbon.setAttribute('aria-label', 'Document layout tools');
    const ribbonTitle = document.createElement('strong');
    ribbonTitle.textContent = 'Layout & editing';
    ribbon.appendChild(ribbonTitle);
    function ribbonButton(label, fn, title=label) {
      const b=document.createElement('button'); b.type='button'; b.textContent=label; b.title=title;
      b.addEventListener('mousedown',e=>e.preventDefault());
      b.addEventListener('click',fn); ribbon.appendChild(b); return b;
    }
    function setBlockLayout(key,value) {
      const {from,$from} = editor.state.selection;
      let depth=$from.depth;
      while(depth>0 && !['paragraph','heading'].includes($from.node(depth).type.name)) depth--;
      if(depth===0) return;
      const block=$from.node(depth), pos=$from.before(depth);
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos,undefined,{...block.attrs,[key]:value}));
      editor.commands.focus();
    }
    for (const [label,align] of [['Left','left'],['Center','center'],['Right','right'],['Justify','justify']])
      ribbonButton(label,()=>setBlockLayout('textAlign',align),`Align ${align}`);
    const spacing=document.createElement('select');
    spacing.setAttribute('aria-label','Line spacing');
    spacing.innerHTML='<option value="1.2">1.2 spacing</option><option value="1.4">1.4 spacing</option><option value="1.65" selected>1.65 spacing</option><option value="2">Double spacing</option>';
    spacing.addEventListener('change',()=>setBlockLayout('lineHeight',spacing.value)); ribbon.appendChild(spacing);
    ribbonButton('Indent +',()=>{const a=editor.getAttributes('paragraph');setBlockLayout('indent',Math.min(4,(a.indent||0)+1));});
    ribbonButton('Indent −',()=>{const a=editor.getAttributes('paragraph');setBlockLayout('indent',Math.max(0,(a.indent||0)-1));});
    const findInput=document.createElement('input'); findInput.type='search'; findInput.placeholder='Find in article';
    findInput.setAttribute('aria-label','Find text'); findInput.className='cms-find-input'; ribbon.appendChild(findInput);
    let lastFind=-1;
    function findNext() {
      const term=findInput.value; if(!term)return;
      const text=editor.state.doc.textBetween(0,editor.state.doc.content.size,'\n','\n');
      const offset=text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase(),lastFind+1);
      if(offset<0){lastFind=-1;return;}
      // Map text offset to document positions (accounts for node boundaries).
      let seen=0, match=null;
      editor.state.doc.descendants((node,pos)=>{if(match!==null)return false;
        if(node.isText){const len=node.text.length;if(seen+len>offset){match=pos+offset-seen;return false;}seen+=len;}
        else if(node.isBlock && pos>0) seen+=1;
      });
      if(match!==null){editor.commands.setTextSelection({from:match,to:match+term.length});editor.commands.focus();lastFind=offset;}
    }
    ribbonButton('Find next',findNext);
    findInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findNext();}});
    const zoom=document.createElement('select');zoom.setAttribute('aria-label','Editor zoom');
    zoom.innerHTML='<option value="0.85">85% zoom</option><option value="1" selected>100% zoom</option><option value="1.15">115% zoom</option><option value="1.3">130% zoom</option>';
    zoom.addEventListener('change',()=>mount.style.setProperty('--cms-editor-zoom',zoom.value));ribbon.appendChild(zoom);
    toolbar.after(ribbon);
    ribbonTitle.remove();

    // One cohesive ribbon for the EXISTING editor (not a second editor).
    // Move the existing controls instead of cloning them: all commands retain
    // their original TipTap editor instance, selections, and save workflow.
    const workbench = document.createElement('section');
    workbench.className = 'cms-document-workbench';
    workbench.setAttribute('aria-label', 'Article document tools');
    const tabs = document.createElement('div');
    tabs.className = 'cms-ribbon-tabs';
    tabs.setAttribute('role', 'tablist');
    const panels = document.createElement('div');
    panels.className = 'cms-ribbon-panels';
    const homePanel = document.createElement('div');
    const insertPanel = document.createElement('div');
    const layoutPanel = document.createElement('div');
    const viewPanel = document.createElement('div');
    const reviewPanel = document.createElement('div');
    const ribbonPanels = { Home: homePanel, Insert: insertPanel, Layout: layoutPanel, Review: reviewPanel, View: viewPanel };
    const ribbonTabs = {};
    for (const [name,panel] of Object.entries(ribbonPanels)) {
      panel.className = 'cms-ribbon-panel';
      panel.setAttribute('role','tabpanel');
      panel.setAttribute('aria-label',name+' tools');
      panel.hidden = name !== 'Home';
      const tab=document.createElement('button');tab.type='button';tab.textContent=name;
      tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(name==='Home'));
      tab.addEventListener('click',()=>{
        for (const [n,p] of Object.entries(ribbonPanels)) {p.hidden=n!==name;ribbonTabs[n].setAttribute('aria-selected',String(n===name));}
      });
      ribbonTabs[name]=tab;tabs.appendChild(tab);panels.appendChild(panel);
    }
    const header = document.createElement('div');
    header.className='cms-workbench-heading';
    header.innerHTML='<div><strong>Article studio</strong><span>Write · Format · Publish</span></div><span class="cms-workbench-hint">Tip: drag the image by its top handle to move it between paragraphs</span>';
    workbench.append(header,tabs,panels);
    toolbar.before(workbench);
    toolbar.classList.add('cms-ribbon-controls');
    homePanel.appendChild(toolbar);
    // Move the existing image insertion control into Insert without changing its event handlers.
    const imageInsert = [...toolbar.querySelectorAll('button')].find(b=>/insert \/ edit image/i.test(b.textContent));
    if (imageInsert) insertPanel.appendChild(imageInsert);
    layoutPanel.appendChild(ribbon);
    const findGroup = document.createElement('div');findGroup.className='cms-review-tools';
    findGroup.append(findInput, [...ribbon.querySelectorAll('button')].find(b=>b.textContent==='Find next'));
    reviewPanel.appendChild(findGroup);
    viewPanel.appendChild(zoom);
    const viewInfo = document.createElement('span');
    viewInfo.className='cms-view-note';viewInfo.textContent='Zoom affects editing only, not the published article.';
    viewPanel.appendChild(viewInfo);
    // Show actual editor status; the publishing workflow remains the existing one.
    const editorStatus=document.createElement('span');
    editorStatus.className='cms-editor-status';
    editorStatus.textContent='Editing draft';
    tabs.appendChild(editorStatus);
    const focusButton=document.createElement('button');focusButton.type='button';
    focusButton.textContent='Focus writing';
    focusButton.addEventListener('click',()=>{
      workbench.classList.toggle('cms-focus-writing');
      mount.classList.toggle('cms-focus-writing');
      focusButton.textContent=mount.classList.contains('cms-focus-writing')?'Exit focus mode':'Focus writing';
    });
    viewPanel.appendChild(focusButton);
    // Prevent toolbar pointer presses from collapsing a selected text range.
    workbench.addEventListener('mousedown',e=>{
      if(e.target.closest('button') && !e.target.closest('.cms-ribbon-tabs')) e.preventDefault();
    });


    // Keep image selection within the article workflow; no numeric IDs needed.
    const mediaDialog = document.createElement('dialog');
    mediaDialog.id = 'cms-image-dialog';
    mediaDialog.className = 'cms-image-dialog';
    mediaDialog.innerHTML = `<div class="cms-image-dialog-body">
      <div class="cms-image-dialog-heading"><h3>Insert or edit photograph</h3><button type="button" data-close>Close</button></div>
      <p class="admin-note">Upload from your computer or choose a previously uploaded photograph.</p>
      <label>Upload from computer <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-file></label>
      <button type="button" data-upload>Upload and select</button>
      <p role="status" aria-live="polite" data-status></p>
      <div class="cms-image-gallery" data-gallery></div>
      <label>Image size <select data-size><option value="small">Small</option><option value="medium">Medium</option><option value="large" selected>Large</option><option value="full">Full width</option></select></label>
      <label>Text wrapping <select data-wrap><option value="none">In line with text</option><option value="left">Wrap text on right</option><option value="right">Wrap text on left</option></select></label>
      <label>Width <input type="range" data-width min="15" max="100" value="100"> <output data-width-label>100%</output></label>
      <fieldset class="farm-crop-controls"><legend>Crop (non-destructive)</legend>
      <label>Visible height <input type="range" data-crop min="25" max="100" value="100"></label>
      <label>Horizontal focus <input type="range" data-crop-x min="0" max="100" value="50"></label>
      <label>Vertical focus <input type="range" data-crop-y min="0" max="100" value="50"></label></fieldset>
      <label>Alignment <select data-align><option value="left">Left</option><option value="center" selected>Center</option><option value="right">Right</option></select></label>
      <label>Alt text <input type="text" maxlength="500" data-alt></label>
      <label>Caption <input type="text" maxlength="500" data-caption></label>
      <div class="cms-image-dialog-actions"><button type="button" data-insert>Insert / apply changes</button><button type="button" data-move-up>Move image up</button><button type="button" data-move-down>Move image down</button><button type="button" data-remove>Remove selected image</button></div>
    </div>`;
    document.body.appendChild(mediaDialog);
    const $image = selector => mediaDialog.querySelector(`[data-${selector}]`);
    let chosenMedia = null;
    let imageEditPosition = null;
    let savedInsertPosition = null;
    const imageStatus = message => { $image('status').textContent = message; };
    const allowedImage = file => file && ['image/jpeg','image/png','image/webp','image/avif'].includes(file.type) && file.size > 0 && file.size <= 10000000;
    async function mediaPost(url, body) {
      const response = await fetch(url,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const data = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      return data;
    }
    async function loadMediaGallery(selectedId) {
      const response = await fetch('/api/admin/media',{credentials:'same-origin'});
      const data = await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error || 'Could not load photographs');
      const gallery = $image('gallery'); gallery.replaceChildren();
      for (const item of (data.items || [])) {
        const tile = document.createElement('button');tile.type='button';tile.className='cms-image-tile';
        const img=document.createElement('img');img.src=item.secure_url;img.alt=item.alt_en || 'Uploaded photograph';img.loading='lazy';
        const label=document.createElement('span');label.textContent=`Photo #${item.id}`;
        tile.append(img,label);gallery.append(tile);
        tile.addEventListener('click',()=>{
          chosenMedia=item;
          gallery.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===tile));
          const ne=editingLanguage==='ne';
          $image('alt').value=(ne?item.alt_ne:item.alt_en)||'';
          $image('caption').value=(ne?item.caption_ne:item.caption_en)||'';
        });
        if(item.id===selectedId) tile.click();
      }
      if(!(data.items||[]).length) imageStatus('No images uploaded yet. Choose a file above.');
    }
    async function openImageDialog() {
      const selected=editor.state.selection;
      const node=selected.node?.type?.name==='farmImage' ? selected.node : null;
      imageEditPosition=node?selected.from:null;
      savedInsertPosition=selected.from;
      chosenMedia=null;
      $image('size').value=node?.attrs?.size||'large';
      $image('align').value=node?.attrs?.align||'center';
    $image('wrap').value=node?.attrs?.wrap||'none';
    $image('width').value=node?.attrs?.widthPct??100;
    $image('crop').value=node?.attrs?.crop??100;
    $image('crop-x').value=node?.attrs?.cropX??50;
    $image('crop-y').value=node?.attrs?.cropY??50;
    $image('width-label').textContent=`${$image('width').value}%`;
      $image('alt').value=node?.attrs?.alt||'';
      $image('caption').value=node?.attrs?.caption||'';
      $image('remove').hidden=!node;
      imageStatus(node?'Editing selected image. Choose a different photo to replace it, if needed.':'Select a photograph.');
      mediaDialog.showModal();
      try {
        await loadMediaGallery(node?.attrs?.mediaId);
        if(node && !chosenMedia) chosenMedia={id:node.attrs.mediaId,secure_url:node.attrs.src};
      } catch(error) {imageStatus(error.message);}
    }
    controls.splice(8,0,['Insert / edit image',openImageDialog]);
    $image('width').addEventListener('input',()=>{$image('width-label').textContent=`${$image('width').value}%`;});
    $image('close').addEventListener('click',()=>mediaDialog.close());
    $image('upload').addEventListener('click',async()=>{
      const file=$image('file').files?.[0];
      if(!allowedImage(file)){imageStatus('Choose a JPEG, PNG, WebP or AVIF image under 10 MB.');return;}
      const button=$image('upload');button.disabled=true;
      try {
        imageStatus('Uploading photograph…');
        const signed=await mediaPost('/api/admin/media/sign',{filename:file.name,mime_type:file.type,size:file.size});
        const form=new FormData();
        for(const key of ['api_key','timestamp','folder','public_id','signature'])form.append(key,String(signed[key]));
        form.append('file',file);
        const response=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloud_name.trim())}/image/upload`,{method:'POST',body:form});
        const uploaded=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(uploaded.error?.message||'Cloudinary upload failed');
        const ne=editingLanguage==='ne';
        const saved=await mediaPost('/api/admin/media',{
          public_id:uploaded.public_id,secure_url:uploaded.secure_url,format:uploaded.format,
          width:uploaded.width,height:uploaded.height,bytes:uploaded.bytes,
          alt_en:ne?'':$image('alt').value.trim(),alt_ne:ne?$image('alt').value.trim():'',
          caption_en:ne?'':$image('caption').value.trim(),caption_ne:ne?$image('caption').value.trim():''
        });
        await loadMediaGallery(saved.id);
        imageStatus('Uploaded. Click Insert / apply changes to place the image.');
      } catch(error){imageStatus(`Upload failed: ${error.message}`);}finally{button.disabled=false;}
    });
    $image('insert').addEventListener('click',()=>{
      if(!chosenMedia){imageStatus('Select or upload a photograph first.');return;}
      const attrs={src:chosenMedia.secure_url,mediaId:chosenMedia.id,
        alt:$image('alt').value.trim(),caption:$image('caption').value.trim(),
        size:$image('size').value,align:$image('align').value,
        widthPct:Number($image('width').value),wrap:$image('wrap').value,
        crop:Number($image('crop').value),cropX:Number($image('crop-x').value),cropY:Number($image('crop-y').value)};
      if(imageEditPosition!==null && editor.state.doc.nodeAt(imageEditPosition)?.type?.name==='farmImage'){
        const tr=editor.state.tr.setNodeMarkup(imageEditPosition,undefined,attrs);
        editor.view.dispatch(tr);
      } else {
        editor.chain().focus().insertContentAt(savedInsertPosition,{type:'farmImage',attrs}).run();
      }
      mediaDialog.close();imageStatus('Image added to the article. Save your draft to keep changes.');
    });
    $image('remove').addEventListener('click',()=>{
      if(imageEditPosition===null)return;
      const node=editor.state.doc.nodeAt(imageEditPosition);
      if(node?.type?.name==='farmImage')editor.view.dispatch(editor.state.tr.delete(imageEditPosition,imageEditPosition+node.nodeSize));
      mediaDialog.close();
    });
    // Reorder an image by one adjacent block, without changing its metadata.
    // This works with paragraphs, headings, lists and other block nodes.
    function moveImage(direction) {
      const pos = imageEditPosition;
      if (pos === null) return;
      const doc = editor.state.doc;
      const node = doc.nodeAt(pos);
      if (!node || node.type.name !== 'farmImage') return;
      const resolved = doc.resolve(pos);
      const parent = resolved.parent;
      const index = resolved.index();
      const adjacentIndex = index + direction;
      if (adjacentIndex < 0 || adjacentIndex >= parent.childCount) {
        imageStatus(direction < 0 ? 'Image is already first in this section.' : 'Image is already last in this section.');
        return;
      }
      const adjacent = parent.child(adjacentIndex);
      const start = direction < 0 ? pos - adjacent.nodeSize : pos;
      const end = direction < 0 ? pos + node.nodeSize : pos + node.nodeSize + adjacent.nodeSize;
      const reordered = direction < 0 ? [node, adjacent] : [adjacent, node];
      const newPos = direction < 0 ? start : pos + adjacent.nodeSize;
      try {
        editor.view.dispatch(editor.state.tr.replaceWith(start, end, reordered));
        imageEditPosition = newPos;
        savedInsertPosition = newPos;
        editor.commands.setNodeSelection(newPos);
        imageStatus('Image moved. Save the article to keep this position.');
      } catch (error) {
        console.error('Image move failed:', error);
        imageStatus('Could not move the image across this block.');
      }
    }
    $image('move-up').addEventListener('click', () => moveImage(-1));
    $image('move-down').addEventListener('click', () => moveImage(1));

    // Clicking selects the photograph, so the main image toolbar edits it.
    mount.addEventListener('click', event => {
      const figure = event.target.closest?.('figure[data-farm-image]');
      if (!figure || !mount.contains(figure)) return;
      const pos = editor.view.posAtDOM(figure, 0);
      if (editor.state.doc.nodeAt(pos)?.type?.name === 'farmImage') {
        editor.commands.setNodeSelection(pos);
      }
    });
    // Double-click a photo to edit its size, position, caption, or replace it.
    mount.addEventListener('dblclick',event=>{
      const figure=event.target.closest('figure[data-farm-image]');
      if(!figure)return;
      const pos=editor.view.posAtDOM(figure,0);
      editor.commands.setNodeSelection(pos);
      openImageDialog();
    });
    for (const [label, action] of controls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', action);
      if (/^Insert \/ edit image$/i.test(label)) insertPanel.appendChild(button);
      else toolbar.appendChild(button);
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

    const authorLabel = document.createElement('label');
    authorLabel.textContent = 'Author (optional; defaults to Anju Farm)';
    const authorField = document.createElement('input');
    authorField.type = 'text'; authorField.maxLength = 150;
    authorLabel.append(authorField); titleField.parentElement.after(authorLabel);
    let featured = null;
    const featuredBox = document.createElement('fieldset');
    featuredBox.className = 'cms-cover-settings';
    featuredBox.innerHTML = '<legend>Featured image</legend><p>Choose the cover photograph for this language. It is separate from inline images.</p><button type="button" data-choose>Choose photograph</button> <button type="button" data-remove>Remove</button><p data-status></p><img data-preview hidden style="width:100%;max-width:480px;height:auto">';
    titleField.parentElement.after(featuredBox);
    const coverPreview=featuredBox.querySelector('[data-preview]');
    function setFeatured(value){
      featured=value || null;
      coverPreview.hidden=!featured;
      if(featured){coverPreview.src=featured.src;coverPreview.alt=featured.alt_en||'';}else coverPreview.removeAttribute('src');
      featuredBox.querySelector('[data-remove]').disabled=!featured;
    }
    featuredBox.querySelector('[data-remove]').onclick=()=>setFeatured(null);
    featuredBox.querySelector('[data-choose]').onclick=async()=>{
      const dialog=document.createElement('dialog');
      dialog.className='cms-cover-picker';
      dialog.setAttribute('aria-label','Choose featured photograph');
      const heading=document.createElement('h2');heading.textContent='Choose featured photograph';dialog.append(heading);
      const close=document.createElement('button');close.type='button';close.textContent='Cancel';close.onclick=()=>dialog.close();dialog.append(close);
      const gallery=document.createElement('div');gallery.className='cms-image-gallery';dialog.append(gallery);
      document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
      try{const data=await getJSON('/api/admin/media');for(const m of data.items||[]){
        const b=document.createElement('button');b.type='button';b.className='cms-image-tile';const img=document.createElement('img');img.src=m.secure_url;img.alt=m.alt_en||'Photograph';img.loading='lazy';b.append(img,document.createTextNode('Photo #'+m.id));gallery.append(b);
        b.onclick=()=>{setFeatured({mediaId:m.id,src:m.secure_url,alt_en:m.alt_en,alt_ne:m.alt_ne});dialog.close();};
      }if(!gallery.children.length)gallery.textContent='No photographs available.';}catch(e){gallery.textContent=e.message;}
    };
    setFeatured(null);
    function documentWithCover(){return {...editor.getJSON(),featuredImage:featured,author:authorField.value.trim()};}
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
        content: documentWithCover()
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
        'LI', 'BLOCKQUOTE', 'BR', 'HR', 'S', 'DEL', 'A', 'FIGURE', 'IMG', 'FIGCAPTION'
      ]);
      function copyNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        const fragment = document.createDocumentFragment();
        const destination = allowed.has(node.tagName)
          ? document.createElement(node.tagName.toLowerCase()) : fragment;
        if (['P','H2','H3','H4'].includes(node.tagName)) {
          const align=node.style.textAlign;
          if(['left','center','right','justify'].includes(align)) destination.style.textAlign=align;
          const line=node.style.lineHeight;
          if(['1.2','1.4','1.65','2'].includes(line)) destination.style.lineHeight=line;
          const indent=Math.min(4,Math.max(0,parseInt(node.dataset.indent||'0',10)||0));
          if(indent) destination.style.marginLeft=`${indent*1.5}rem`;
        }
        if (node.tagName === 'A') {
          const href = safeArticleLink(node.getAttribute('href') || '');
          if (!href) return document.createTextNode(node.textContent || '');
          destination.setAttribute('href', href);
          if (href.startsWith('https:')) { destination.setAttribute('target', '_blank'); destination.setAttribute('rel', 'noopener noreferrer'); }
        }
        if (node.tagName === 'IMG') {
          const src = node.getAttribute('src') || '';
          if (!/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//.test(src)) return fragment;
          destination.setAttribute('src', src);
          destination.setAttribute('alt', node.getAttribute('alt') || '');
          destination.setAttribute('loading', 'lazy');
        }
        if (node.tagName === 'FIGURE') {
          for (const key of ['widthPct','crop','cropX','cropY']) {
            const val=Number(node.dataset[key]);
            if(Number.isFinite(val)) destination.style.setProperty({'widthPct':'--farm-width','crop':'--farm-crop','cropX':'--farm-crop-x','cropY':'--farm-crop-y'}[key],`${val}%`);
          }
          const wrap=node.dataset.wrap;
          if(['none','left','right'].includes(wrap)) destination.classList.add(`farm-wrap-${wrap}`);
          const classes=(node.getAttribute('class')||'').split(/\s+/).filter(c=>/^farm-(?:inline-image|size-(?:small|medium|large|full)|align-(?:left|center|right))$/.test(c)); destination.classList.add(...classes); }
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
.farm-inline-image{box-sizing:border-box;max-width:100%;width:var(--farm-width,100%);margin:1.5rem auto;text-align:center;clear:both}.farm-inline-image img{display:block;width:100%;height:auto}.farm-inline-image figcaption{font-size:.9rem;color:#586052}.farm-image-window{overflow:hidden}.farm-wrap-left{float:left;clear:left;max-width:48%;margin:0 1.4rem 1rem 0}.farm-wrap-right{float:right;clear:right;max-width:48%;margin:0 0 1rem 1.4rem}.farm-wrap-none{float:none}.farm-align-left{margin-left:0;margin-right:auto}.farm-align-right{margin-left:auto;margin-right:0}.farm-inline-image:not([style*="--farm-crop:100%"]) .farm-image-window{aspect-ratio:4/3}.farm-inline-image:not([style*="--farm-crop:100%"]) .farm-image-window img{height:100%;object-fit:cover;object-position:var(--farm-crop-x,50%) var(--farm-crop-y,50%)}
html[lang="ne"] main{font-family:"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif;font-size:19px;line-height:1.9}html[lang="ne"] .excerpt{font-size:19px}html[lang="ne"] h1{line-height:1.4}html[lang="ne"] .article h2{font-size:28px;line-height:1.4}html[lang="ne"] .farm-inline-image figcaption{font-size:16px;line-height:1.7}</style>${language === 'ne' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&amp;display=swap">' : ''}</head><body><header>DRAFT PREVIEW — NOT PUBLISHED · ${language === 'ne' ? 'NEPALI' : 'ENGLISH'}</header>
<main><div class="category">${category}</div><h1>${title}</h1><p>${escapePreviewText(authorField.value.trim() || (language === "ne" ? "अञ्जु बहुउद्देश्यीय कृषि फार्म" : "Anju Multipurpose Agriculture Farm"))}</p><p class="excerpt">${excerpt}</p>
${featured ? `<img style="width:100%;height:auto" src="${escapePreviewText(featured.src)}" alt="${escapePreviewText((language==='ne'?featured.alt_ne:featured.alt_en)||'')}">` : ''}<div class="article">${content}</div></main></body></html>`;
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const tab = window.open(blobUrl, '_blank');
      if (tab) tab.opener = null;
      else showStatus('Preview was blocked. Please allow pop-ups for staging.', true);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }



    // Read-only preview of the SAVED revision. Does not change the editor form.
    async function previewSavedLanguage(id, language) {
      if (saving || loading || submittingReview || publishing) return;
      try {
        const data = await getJSON(language === 'ne'
          ? `/api/admin/cms/translations/${id}`
          : `/api/admin/cms/articles/${id}`);
        const saved = language === 'ne' ? data.translation : data.article;
        if (!saved?.content_json) throw new Error('No saved draft content for this language.');
        const title = escapePreviewText(saved.title || 'Untitled');
        const category = escapePreviewText(saved.category || 'FARM STORIES');
        const excerpt = escapePreviewText(saved.excerpt || '');
        const doc = typeof saved.content_json === 'string' ? JSON.parse(saved.content_json) : saved.content_json;
        const content = previewJsonHtml(doc);
        const html = `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Saved Draft Preview — ${title}</title>
<style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f8f6ef;color:#252c24;font:17px/1.75 Georgia,serif}header{padding:12px 5%;background:#6b342d;color:white;font:600 13px/1.4 Arial,sans-serif;letter-spacing:.06em}main{max-width:850px;margin:44px auto;padding:0 24px 80px}.category{font:600 12px/1.5 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#7c6251}h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.2;margin:12px 0 20px}.excerpt{font-size:1.15rem;color:#586052}.article{margin-top:32px}.article p{margin:1em 0}.article h2,.article h3,.article h4{line-height:1.3}.article blockquote{border-left:4px solid #9b7453;padding-left:18px}.farm-inline-image{box-sizing:border-box;max-width:100%;width:var(--farm-width,100%);margin:1.5rem auto;text-align:center;clear:both}.farm-inline-image img{display:block;width:100%;height:auto;transform:rotate(var(--farm-rotation,0deg))}.farm-inline-image figcaption{font-size:.9rem;color:#586052}.farm-image-window{overflow:hidden}.farm-wrap-left{float:left;clear:left;max-width:48%;margin:0 1.4rem 1rem 0}.farm-wrap-right{float:right;clear:right;max-width:48%;margin:0 0 1rem 1.4rem}.farm-align-left{margin-left:0;margin-right:auto}.farm-align-right{margin-left:auto;margin-right:0}.farm-inline-image:not([style*="--farm-crop:100%"]) .farm-image-window{aspect-ratio:4/3}.farm-inline-image:not([style*="--farm-crop:100%"]) .farm-image-window img{height:100%;object-fit:cover;object-position:var(--farm-crop-x,50%) var(--farm-crop-y,50%)}html[lang="ne"] main{font-family:"Noto Sans Devanagari", "Nirmala UI", Mangal, sans-serif;font-size:19px;line-height:1.9}html[lang="ne"] .excerpt{font-size:19px}html[lang="ne"] h1{line-height:1.4}html[lang="ne"] .article h2{font-size:28px;line-height:1.4}html[lang="ne"] .farm-inline-image figcaption{font-size:16px;line-height:1.7}</style>${language === 'ne' ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&amp;display=swap">' : ''}</head><body><header>SAVED DRAFT PREVIEW · ${language === 'ne' ? 'NEPALI' : 'ENGLISH'} · NOT PUBLISHED BY THIS ACTION</header><main><div class="category">${category}</div><h1>${title}</h1><p>${escapePreviewText(doc.author || (language === 'ne' ? 'अञ्जु बहुउद्देश्यीय कृषि फार्म' : 'Anju Multipurpose Agriculture Farm'))}</p><p class="excerpt">${excerpt}</p><div class="article">${content}</div></main></body></html>`;
        const url = URL.createObjectURL(new Blob([html], {type:'text/html'}));
        const tab = window.open(url, '_blank');
        if (tab) tab.opener = null;
        else showStatus('Please allow preview pop-ups for staging.', true);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch(error) {
        console.error('Saved draft preview failed',error);
        showStatus(error.message,true);
      }
    }
    function previewJsonHtml(doc) {
      const root=document.createElement('div');
      function render(node) {
        if(!node || typeof node!=='object') return document.createDocumentFragment();
        if(node.type==='farmImage') {
          const a=node.attrs||{};
          if(!/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\//.test(a.src||'')) return document.createDocumentFragment();
          const fig=document.createElement('figure');fig.className='farm-inline-image';
          fig.classList.add('farm-align-'+(['left','right','center'].includes(a.align)?a.align:'center'));
          fig.classList.add('farm-wrap-'+(['left','right','none'].includes(a.wrap)?a.wrap:'none'));
          for(const [name,key,def,min,max] of [['--farm-width','widthPct',100,15,100],['--farm-crop','crop',100,10,100],['--farm-crop-x','cropX',50,0,100],['--farm-crop-y','cropY',50,0,100]]) {
            const v=Number(a[key]);fig.style.setProperty(name,`${Math.min(max,Math.max(min,Number.isFinite(v)?v:def))}%`);
          }
          const rotation=Number(a.rotation);fig.style.setProperty('--farm-rotation',`${[0,90,180,270].includes(rotation)?rotation:0}deg`);
          const frame=document.createElement('div');frame.className='farm-image-window';
          const img=document.createElement('img');img.src=a.src;img.alt=String(a.alt||'');img.loading='lazy';frame.append(img);
          const caption=document.createElement('figcaption');caption.textContent=String(a.caption||'');
          fig.append(frame,caption);return fig;
        }
        if(node.type==='text') {
          let el=document.createTextNode(String(node.text||''));
          for(const mark of node.marks||[]) {
            const tag={bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'}[mark.type];
            if(tag){const wrap=document.createElement(tag);wrap.append(el);el=wrap;}
            if(mark.type==='link') {
              const href=safeArticleLink(mark.attrs?.href || '');
              if(href) {const a=document.createElement('a');a.href=href;if(href.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}a.append(el);el=a;}
            }
          }
          return el;
        }
        const tags={doc:null,paragraph:'p',heading:'h2',bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote',horizontalRule:'hr',hardBreak:'br'};
        if(!Object.prototype.hasOwnProperty.call(tags,node.type)) return document.createDocumentFragment();
        let tag=tags[node.type];
        if(node.type==='heading' && [2,3,4].includes(Number(node.attrs?.level))) tag=`h${node.attrs.level}`;
        const el=tag?document.createElement(tag):document.createDocumentFragment();
        if(node.type==='paragraph'||node.type==='heading') {
          const attrs=node.attrs||{};
          if(['left','right','center','justify'].includes(attrs.textAlign)) el.style.textAlign=attrs.textAlign;
          if(['1.2','1.4','1.65','2'].includes(String(attrs.lineHeight))) el.style.lineHeight=String(attrs.lineHeight);
          const indent=Math.min(4,Math.max(0,parseInt(attrs.indent,10)||0));
          if(indent) el.style.marginLeft=`${indent*1.5}rem`;
        }
        for(const child of node.content||[]) el.append(render(child));
        return el;
      }
      root.append(render(doc));return root.innerHTML;
    }

    function showStatus(message, isError = false) {
      statusMessage.textContent = message;
      statusMessage.className = isError ? 'admin-error' : 'admin-note';
    }

    function setLanguage(language) {
      editingLanguage = language;
      mount.setAttribute("lang", language === "ne" ? "ne" : "en");

      languageMessage.textContent = language === 'ne'
        ? 'Editing language: नेपाली (Nepali)'
        : 'Editing language: English';

      languageMessage.className = 'admin-note';

      slugField.readOnly = editingId !== null;
      categoryField.readOnly = language === 'ne';
    }

    function clearForm() {
      form.reset();
      authorField.value = "";
      setFeatured(null);
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
        setFeatured(article.content_json.featuredImage);
        authorField.value = article.content_json.author || "";

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
        authorField.value = nepali?.content_json?.author || (!nepali ? english.content_json?.author : '') || '';
        setFeatured(nepali?.content_json ? nepali.content_json.featuredImage : english.content_json?.featuredImage);

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
        articlesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    const articleSearch = document.getElementById('cms-article-search');
    const articleFilter = document.getElementById('cms-article-filter');
    function filterArticleCards() {
      const q = (articleSearch?.value || '').trim().toLocaleLowerCase();
      const filter = articleFilter?.value || 'all';
      for (const card of articlesList.children) {
        const matchesText = !q || (card.dataset.search || card.textContent.toLocaleLowerCase()).includes(q);
        const matchesStatus = filter === 'all' ||
          (filter === 'published' && card.dataset.published === 'true') ||
          (filter === 'draft' && card.dataset.published !== 'true') ||
          (filter === 'review' && card.dataset.review === 'true');
        card.hidden = !(matchesText && matchesStatus);
      }
    }
    articleSearch?.addEventListener('input', filterArticleCards);
    articleFilter?.addEventListener('change', filterArticleCards);

    async function loadTrash(){
      const list=document.getElementById('cms-trash-list');const message=document.getElementById('cms-trash-status');
      if(!list)return;
      try{const response=await fetch('/api/admin/cms/trash',{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load trash');
        list.replaceChildren();message.textContent='';
        if(!data.articles?.length){const li=document.createElement('li');li.textContent='Trash is empty.';list.append(li);return;}
        for(const article of data.articles){const li=document.createElement('li');
          const heading=document.createElement('strong');heading.textContent=`${article.title} — /${article.slug}`;
          const buttons=document.createElement('div');buttons.className='cms-card-actions';
          for(const [label,method] of [['Restore','PATCH'],['Delete permanently','DELETE']]){
            const button=document.createElement('button');button.type='button';button.textContent=label;if(method==='DELETE')button.className='cms-danger';
            button.addEventListener('click',async()=>{
              if(!confirm(method==='DELETE'?`PERMANENTLY delete "${article.title}" and both translations? This cannot be undone.`:`Restore "${article.title}"?`))return;
              button.disabled=true;try{const r=await fetch(`/api/admin/cms/trash/${article.id}`,{method,credentials:'same-origin'});const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');await loadTrash();await loadArticles();}catch(e){message.textContent=e.message;button.disabled=false;}
            });buttons.append(button);
          }li.append(heading,buttons);list.append(li);
        }
      }catch(e){message.textContent=e.message;}
    }
    document.getElementById('cms-trash-refresh')?.addEventListener('click',loadTrash);
    loadTrash();
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
            const englishStatus = document.createElement('span');
            englishStatus.textContent = ` English editorial status: ${article.english_review_status || 'draft'}`;
            item.appendChild(englishStatus);
            const englishReviewAction = (action,label) => {
              const btn=document.createElement('button');btn.type='button';btn.textContent=label;
              btn.addEventListener('click',async()=>{
                const notes=action==='request_changes'?window.prompt('Required English review feedback:'):'';
                if(action==='request_changes'&&!notes?.trim())return;
                if(!window.confirm(`${label} for English article #${article.id}?`))return;
                try{const response=await fetch(`/api/admin/cms/articles/${article.id}/review`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,notes})});const data=await response.json();if(!response.ok)throw Error(data.error||'Review failed');await loadArticles();showStatus(`English: ${data.status}`);}catch(e){showStatus(e.message,true)}
              });item.appendChild(btn);
            };
            if(['draft','changes_requested'].includes(article.english_review_status||'draft'))englishReviewAction('submit','Submit English for Review');
            if(article.english_review_status==='submitted'){
              englishReviewAction('approve','Approve English');
              englishReviewAction('request_changes','Request English Changes');
            }

            const englishPreview = document.createElement('button');
            englishPreview.type='button';
            englishPreview.textContent='Preview English Draft';
            englishPreview.addEventListener('click',()=>previewSavedLanguage(article.id,'en'));
            item.appendChild(englishPreview);
            const englishReviewStatus=document.createElement('span');
            englishReviewStatus.textContent=' English review required before publication';
            englishReviewStatus.className='cms-card-extra';
            item.appendChild(englishReviewStatus);

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
            publishEnglishButton.disabled = article.english_review_status !== 'approved';
            publishEnglishButton.title = publishEnglishButton.disabled ? 'Approval of the current English revision required' : 'Publish approved English revision';
            publicationButtons.add(publishEnglishButton);
            item.appendChild(publishEnglishButton);

            // Open the immutable published versions, not the editor preview.
            const viewPublished = (language, caption) => {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = caption;
              button.addEventListener('click', () => {
                const url = `/post?slug=${encodeURIComponent(article.slug)}&lang=${language}`;
                window.open(url, '_blank', 'noopener,noreferrer');
              });
              item.appendChild(button);
            };
            if (englishPublished) viewPublished('en', 'View English Article ↗');
            if (nepaliPublished) viewPublished('ne', 'View Nepali Article ↗');


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
            if (article.nepali_translation_id && nepaliStatus === 'approved' &&
                article.nepali_source_status === 'outdated') {
              const revise = document.createElement('button');
              revise.type = 'button';
              revise.textContent = 'Start Nepali Revision';
              revise.addEventListener('click', async () => {
                if (!window.confirm('Start a new Nepali draft? Existing published Nepali content stays live until a new revision is reviewed and published.')) return;
                revise.disabled = true;
                try {
                  const response = await fetch(`/api/admin/cms/translations/${article.id}/start-revision`, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' }, body: '{}'
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error || 'Unable to start Nepali revision');
                  await loadArticles();
                  await openNepaliDraft(article.id);
                } catch (error) { showStatus(error.message, true); revise.disabled = false; }
              });
              item.appendChild(revise);
            }

            if (article.nepali_translation_id) {
              const nepaliPreview=document.createElement('button');
              nepaliPreview.type='button';
              nepaliPreview.textContent='Preview Nepali Draft';
              nepaliPreview.addEventListener('click',()=>previewSavedLanguage(article.id,'ne'));
              item.appendChild(nepaliPreview);
            }

            if (article.nepali_translation_id && nepaliStatus === 'draft') {
              const submitButton = document.createElement('button');
              submitButton.type = 'button';
              submitButton.textContent = 'Submit Nepali for Review';
              submitButton.addEventListener('click', () => {
                submitNepaliForReview(article.id);
              });
              item.appendChild(submitButton);
            }

            if (article.nepali_translation_id) {
              const translationStatus = document.createElement('span');
              translationStatus.textContent =
                ` Nepali editorial status: ${article.nepali_status || 'draft'}`;

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

          // Present the existing workflow actions as a readable article card.
          // Keep every original button and event handler intact.
          const actionButtons = [...item.children].filter(child => child.tagName === 'BUTTON');
          const historyPanels = [...item.children].filter(child => child.classList?.contains('cms-review-history'));
          const otherLabels = [...item.children].filter(child => child.tagName === 'SPAN' && child !== label);
          const top = document.createElement('div'); top.className = 'cms-card-top';
          const identity = document.createElement('div');
          const heading = document.createElement('strong'); heading.className = 'cms-card-title'; heading.textContent = title;
          const slug = document.createElement('small'); slug.className = 'cms-card-slug'; slug.textContent = '/' + (article.slug || '');
          identity.append(heading, slug);
          const badges = document.createElement('div'); badges.className = 'cms-card-badges';
          for (const [name, live] of [['English', englishPublished], ['Nepali', nepaliPublished]]) {
            const badge = document.createElement('span'); badge.className = 'cms-card-badge' + (live ? ' is-live' : '');
            const pending = name === 'English' ? article.english_source_version !== article.english_live_source_version : article.nepali_approved_revision_id !== article.nepali_published_revision_id || ['draft','in_review','changes_requested'].includes(article.nepali_status);
            const approved = name === 'English' ? article.english_review_status === 'approved' : article.nepali_status === 'approved';
            badge.textContent = name + ': ' + (live ? 'Published' : 'Not published') + (live && pending ? (approved ? ' · Approved revision awaiting publication' : ' · Revision pending') : ''); badges.appendChild(badge);
          }
          if (article.nepali_status === 'in_review') {
            const badge = document.createElement('span'); badge.className = 'cms-card-badge is-review'; badge.textContent = 'Nepali review pending'; badges.appendChild(badge);
          }
          top.append(identity, badges);
          const actions = document.createElement('div'); actions.className = 'cms-card-actions';
          for (const button of actionButtons) {
            if (/^Edit English$|^Edit Nepali$|^Add Nepali$/.test(button.textContent)) button.classList.add('cms-primary-action');
            if (/^Publish/.test(button.textContent)) button.classList.add('cms-publish-action');
            actions.appendChild(button);
          }
          const trashButton=document.createElement('button');
          trashButton.type='button';trashButton.textContent='Move to Trash';trashButton.className='cms-danger';
          trashButton.addEventListener('click',async()=>{
            if(!confirm(`Move "${title}" (English and Nepali) to Trash? It will disappear from the public blog.`))return;
            trashButton.disabled=true;
            try{const response=await fetch(`/api/admin/cms/trash/${article.id}`,{method:'POST',credentials:'same-origin'});
              const data=await response.json();if(!response.ok)throw Error(data.error||'Trash request failed');
              await loadArticles();await loadTrash();
            }catch(error){alert(error.message);trashButton.disabled=false;}
          });actions.appendChild(trashButton);
          item.replaceChildren(top, publicationMeta);
          for (const extra of otherLabels) {extra.classList.add('cms-card-extra'); item.appendChild(extra);}
          item.appendChild(actions);
          for (const panel of historyPanels) actions.appendChild(panel);
          item.dataset.search = (title + ' ' + (article.slug || '')).toLocaleLowerCase();
          item.dataset.published = String(englishPublished || nepaliPublished);
          item.dataset.review = String(article.nepali_status === 'in_review' || article.nepali_source_status === 'outdated');
          articlesList.appendChild(item);
        }
        filterArticleCards();
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

    const saveCloseButton = document.createElement('button');
    saveCloseButton.type = 'submit';
    saveCloseButton.textContent = 'Save & Close';
    saveButton.after(saveCloseButton);
    const saveFeedback = document.createElement('span');
    saveFeedback.setAttribute('role', 'status');
    saveFeedback.setAttribute('aria-live', 'polite');
    saveFeedback.style.display = 'block';
    saveCloseButton.after(saveFeedback);
    function showSaveFeedback(message, isError = false) {
      saveFeedback.textContent = message;
      saveFeedback.className = isError ? 'admin-error' : 'admin-note';
    }
    form.addEventListener('input', () => { if (!saving) saveFeedback.textContent = ''; });
    editor.on('update', () => { if (!saving) saveFeedback.textContent = ''; });

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (saving || loading || submittingReview || publishing) return;
      if (!form.reportValidity()) return;
      const closeAfterSave = event.submitter === saveCloseButton;

      if (editor.isEmpty) {
        showSaveFeedback('Please enter article content.', true);
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
        content_json: documentWithCover()
      };

      if (!isNepali) {
        payload.category = categoryField.value.trim();

        if (!isEditing) {
          payload.slug = slugField.value.trim();
        }
      }

      const submittedSnapshot = currentEditorSnapshot();
      saving = true;
      saveButton.textContent = isEditing ? 'Updating…' : 'Saving…';
      showSaveFeedback('Saving draft…');
      saveCloseButton.disabled = true;
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

        // Keep the editor open after saving. Hiding it collapses the page
        // above the viewport and causes the unexpected mid-page jump.
        editingId = savedId;
        if (!isNepali) {
          slugField.readOnly = true;
          categoryField.readOnly = true;
        }
        saveButton.textContent = isNepali ? 'Save Nepali draft' : 'Update English draft';
        savedEditorSnapshot = submittedSnapshot;

        showStatus(`${savedLanguage} draft #${savedId} saved successfully.`);
        showSaveFeedback(`${savedLanguage} draft saved successfully.`);
        console.log('CMS draft saved:', result);

        const previousScroll = window.scrollY;
        await loadArticles();
        if (closeAfterSave && currentEditorSnapshot() === savedEditorSnapshot) {
          clearForm();
          form.hidden = true;
          previewButton.disabled = true;
          showStatus(`${savedLanguage} draft #${savedId} saved successfully. Editor closed.`);
          articlesList.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          requestAnimationFrame(() => window.scrollTo({ top: previousScroll, left: 0, behavior: 'instant' }));
        }

      } catch (error) {
        console.error('CMS draft saving failed:', error);
        showStatus(error.message, true);
        showSaveFeedback(error.message, true);

      } finally {
        saving = false;
        saveCloseButton.disabled = false;
        saveButton.textContent = editingLanguage === 'ne' ? 'Save Nepali draft' : editingId !== null ? 'Update English draft' : 'Save English draft';
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