
import { Editor, StarterKit, Node } from './tiptap-bundle.js';

// Word-style image node: interactive NodeView, persisted in article JSON.
const FarmImage = Node.create({
  name: 'farmImage', group: 'block', atom: true, selectable: true, draggable: true,
  addAttributes() { return {
    src: { default: null }, alt: { default: '' }, caption: { default: '' }, mediaId: { default: null },
    size: { default: 'large' }, align: { default: 'center' }, widthPct: { default: 100 },
    wrap: { default: 'none' }, crop: { default: 100 }, cropX: { default: 50 }, cropY: { default: 50 }
  }; },
  parseHTML() { return [{ tag: 'figure[data-farm-image]', getAttrs: el => ({
    src: el.querySelector('img')?.getAttribute('src'), alt: el.querySelector('img')?.getAttribute('alt') || '',
    caption: el.querySelector('figcaption')?.textContent || '', mediaId: Number(el.dataset.mediaId) || null,
    size: el.dataset.size || 'large', align: el.dataset.align || 'center',
    widthPct: Number(el.dataset.widthPct) || 100, wrap: el.dataset.wrap || 'none',
    crop: Number(el.dataset.crop) || 100, cropX: Number(el.dataset.cropX) || 50,
    cropY: Number(el.dataset.cropY) || 50
  }) }]; },
  renderHTML({ HTMLAttributes: a }) { return ['figure', {
    'data-farm-image': '', 'data-media-id': a.mediaId, 'data-size': a.size, 'data-align': a.align,
    'data-width-pct': a.widthPct, 'data-wrap': a.wrap, 'data-crop': a.crop,
    'data-crop-x': a.cropX, 'data-crop-y': a.cropY,
    class: `farm-inline-image farm-size-${a.size} farm-align-${a.align} farm-wrap-${a.wrap}`,
    style: `--farm-width:${a.widthPct}%;--farm-crop:${a.crop}%;--farm-crop-x:${a.cropX}%;--farm-crop-y:${a.cropY}%`
  }, ['div', { class: 'farm-image-window' }, ['img', { src: a.src, alt: a.alt, loading: 'lazy' }]],
    ['figcaption', {}, a.caption || '']]; },
  addNodeView() { return ({ node, getPos, editor }) => {
    let current = node;
    const figure = document.createElement('figure');
    figure.dataset.farmImage = '';
    figure.className = 'farm-inline-image farm-editable-image';
    figure.contentEditable = 'false';
    const viewport = document.createElement('div'); viewport.className = 'farm-image-window';
    const img = document.createElement('img'); img.draggable = false;
    const caption = document.createElement('figcaption');
    const actions = document.createElement('div'); actions.className = 'farm-image-quick-actions';
    const move = document.createElement('button'); move.type = 'button'; move.textContent = 'Drag to move';
    move.className = 'farm-image-move'; move.draggable = true; move.title = 'Drag onto a paragraph to move the photograph';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Edit image';
    edit.className = 'farm-image-edit';
    actions.append(move, edit);
    const grips = ['nw', 'ne', 'sw', 'se'].map(corner => {
      const handle = document.createElement('span');
      handle.className = `farm-image-handle farm-image-handle-${corner}`;
      handle.dataset.corner = corner;
      handle.title = 'Drag to resize photograph';
      handle.setAttribute('role', 'button');
      handle.setAttribute('aria-label', `Resize image from ${corner} corner`);
      return handle;
    });
    viewport.append(img, ...grips); figure.append(actions, viewport, caption);
    const position = () => { try { const pos = getPos(); return typeof pos === 'number' ? pos : null; } catch { return null; } };
    const select = () => { const pos = position(); if (pos !== null) editor.commands.setNodeSelection(pos); };
    const updateDisplay = () => {
      const a = current.attrs;
      figure.className = `farm-inline-image farm-editable-image farm-size-${a.size} farm-align-${a.align} farm-wrap-${a.wrap}`;
      figure.style.setProperty('--farm-width', `${a.widthPct}%`);
      figure.style.setProperty('--farm-crop', `${a.crop}%`);
      figure.style.setProperty('--farm-crop-x', `${a.cropX}%`);
      figure.style.setProperty('--farm-crop-y', `${a.cropY}%`);
      if (img.getAttribute('src') !== a.src) img.src = a.src;
      img.alt = a.alt || ''; caption.textContent = a.caption || '';
    };
    updateDisplay();
    figure.addEventListener('pointerdown', e => {
      if (e.target.closest('.farm-image-handle,.farm-image-quick-actions')) return;
      select();
    });
    edit.addEventListener('click', e => { e.preventDefault(); select();
      const button = [...document.querySelectorAll('#cms-toolbar button')].find(b => b.textContent === 'Insert / edit image');
      button?.click();
    });
    for (const handle of grips) handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); select();
      const startX = event.clientX;
      const startWidth = Number(current.attrs.widthPct) || 100;
      const parentWidth = editor.view.dom.clientWidth || 700;
      const sign = handle.dataset.corner.includes('w') ? -1 : 1;
      let latest = startWidth;
      const movePointer = e => {
        latest = Math.round(Math.max(15, Math.min(100, startWidth + sign * (e.clientX-startX)*100/parentWidth)));
        figure.style.setProperty('--farm-width', `${latest}%`);
      };
      const finish = () => {
        window.removeEventListener('pointermove', movePointer);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        const pos = position();
        if (pos !== null) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, {...current.attrs, widthPct: latest}));
      };
      const cancel = () => { latest = startWidth; figure.style.setProperty('--farm-width', `${startWidth}%`); finish(); };
      window.addEventListener('pointermove', movePointer);
      window.addEventListener('pointerup', finish, {once:true});
      window.addEventListener('pointercancel', cancel, {once:true});
    });
    // Native HTML drag and drop: use a dedicated handle, not the image itself.
    // The editor document is updated with a single transaction on drop.
    move.addEventListener('dragstart', event => {
      const pos = position(); if (pos === null) return;
      select();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-farm-image-position', String(pos));
      event.dataTransfer.setData('text/plain', 'Move image');
    });
    return {
      dom: figure,
      update(next) { if (next.type !== current.type) return false; current = next; updateDisplay(); return true; },
      selectNode() { figure.classList.add('ProseMirror-selectednode'); },
      deselectNode() { figure.classList.remove('ProseMirror-selectednode'); },
      stopEvent(e) { return !!e.target.closest?.('.farm-image-quick-actions,.farm-image-handle'); },
      ignoreMutation() { return true; }
    };
  }; }

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
      <div class="cms-image-dialog-actions"><button type="button" data-insert>Insert / apply changes</button><button type="button" data-remove>Remove selected image</button></div>
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


    // Drop the image handle before/after the nearest top-level content block.
    mount.addEventListener('dragover', event => {
      if (!event.dataTransfer.types.includes('application/x-farm-image-position')) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    });
    mount.addEventListener('drop', event => {
      const raw = event.dataTransfer.getData('application/x-farm-image-position');
      if (!raw) return;
      event.preventDefault(); event.stopPropagation();
      const from = Number(raw);
      const doc = editor.state.doc;
      const source = doc.nodeAt(from);
      if (!Number.isInteger(from) || source?.type?.name !== 'farmImage') return;
      const target = editor.view.posAtCoords({left:event.clientX,top:event.clientY});
      if (!target) return;
      let to = target.pos;
      // Snap to top-level boundaries to keep the document valid.
      let cursor = 0, boundary = doc.content.size;
      doc.forEach(node => {
        const middle = cursor + node.nodeSize / 2;
        if (to <= middle && boundary === doc.content.size) boundary = cursor;
        cursor += node.nodeSize;
      });
      to = boundary;
      if (to === from || to === from + source.nodeSize) return;
      const tr = editor.state.tr.delete(from, from + source.nodeSize);
      const insertAt = to > from ? to - source.nodeSize : to;
      tr.insert(insertAt, source);
      editor.view.dispatch(tr);
      editor.commands.setNodeSelection(insertAt);
    }, true);

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