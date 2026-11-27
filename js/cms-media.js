// Staging media manager: Cloudinary uploads + authenticated D1 registry.
const $=id=>document.getElementById(id);
const allowed=new Set(['image/jpeg','image/png','image/webp','image/avif']);
const fields=['alt_en','alt_ne','caption_en','caption_ne'];
const inputs=['cms-media-alt-en','cms-media-alt-ne','cms-media-caption-en','cms-media-caption-ne'];
let selected=null,pending=null,items=[],offset=0,hasMore=false,query='',busy=false;
let trashItems=[],trashOffset=0,trashMore=false;
const status=(message)=>{$('cms-media-status').textContent=message;};
async function request(url,method='GET',body){const r=await fetch(url,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||`Request failed (${r.status})`);return data;}
function validate(file){if(!file||!allowed.has(file.type)||file.size<1||file.size>10000000)throw Error('Choose a JPEG, PNG, WebP or AVIF photograph under 10 MB.');}
function readFields(){return Object.fromEntries(fields.map((k,i)=>[k,$(inputs[i]).value.trim()]));}
function fillFields(item){fields.forEach((k,i)=>{$(inputs[i]).value=item?.[k]||'';});}
function imageEl(item){const img=document.createElement('img');img.src=item.secure_url;img.alt=item.alt_en||'Farm photograph';img.loading='lazy';return img;}
function select(item){selected=item;pending=null;$('cms-media-preview').hidden=true;$('cms-media-upload').hidden=true;$('cms-media-save').hidden=false;$('cms-media-insert').hidden=false;$('cms-media-delete').hidden=false;$('cms-media-details-heading').textContent='Photograph #'+item.id;fillFields(item);const view=$('cms-media-selected-preview');view.replaceChildren();const img=imageEl(item);img.className='farm-media-selected-image';view.append(img);$('cms-media-meta').textContent=[item.width&&item.height?`${item.width} × ${item.height} px`:null,item.format?.toUpperCase(),item.bytes?`${(item.bytes/1048576).toFixed(2)} MB`:null,item.created_at?`Uploaded ${item.created_at}`:null].filter(Boolean).join(' · ');document.querySelectorAll('.farm-media-tile').forEach(b=>b.classList.toggle('is-selected',Number(b.dataset.id)===item.id));status('Image selected. Edit its details or insert it into an article.');}
function render(){const grid=$('cms-media-gallery');grid.replaceChildren();const shown=items.filter(x=>[x.id,x.alt_en,x.alt_ne,x.caption_en,x.caption_ne].some(v=>String(v||'').toLowerCase().includes(query)));for(const item of shown){const b=document.createElement('button');b.type='button';b.className='farm-media-tile';b.dataset.id=item.id;b.append(imageEl(item));const caption=document.createElement('span');caption.textContent=item.caption_en||item.alt_en||`Photograph #${item.id}`;b.append(caption);b.addEventListener('click',()=>select(item));grid.append(b);}if(!shown.length){const p=document.createElement('p');p.className='farm-media-empty';p.textContent=items.length?'No matching photographs.':'No photographs found. Upload your first image.';grid.append(p);}$('cms-media-count').textContent=`${shown.length} shown${hasMore?' · more available':''}`;$('cms-media-more').hidden=!hasMore;if(selected){grid.querySelectorAll('.farm-media-tile').forEach(b=>b.classList.toggle('is-selected',Number(b.dataset.id)===selected.id));}}
async function load(reset=true){try{status('Loading media library…');if(reset){offset=0;items=[];}const data=await request(`/api/admin/media?limit=60&offset=${offset}`);items.push(...(data.items||[]));offset=items.length;hasMore=Boolean(data.has_more);render();status(`${items.length} photographs loaded.`);}catch(e){status(`Could not load library: ${e.message}`);}}
function choose(file){try{validate(file);pending=file;selected=null;document.querySelectorAll('.farm-media-tile').forEach(b=>b.classList.remove('is-selected'));fillFields(null);$('cms-media-details-heading').textContent='New photograph';$('cms-media-meta').textContent=`${file.name} · ${(file.size/1048576).toFixed(2)} MB`;$('cms-media-selected-preview').replaceChildren();$('cms-media-upload').hidden=false;$('cms-media-save').hidden=true;$('cms-media-insert').hidden=true;$('cms-media-delete').hidden=true;const preview=$('cms-media-preview');preview.replaceChildren();const img=document.createElement('img');const url=URL.createObjectURL(file);img.src=url;img.onload=()=>URL.revokeObjectURL(url);const label=document.createElement('span');label.textContent=file.name;preview.append(img,label);preview.hidden=false;status('Ready to upload. Add alt text, then click Upload photograph.');}catch(e){status(e.message);}}
async function upload(){if(!pending)return;const btn=$('cms-media-upload');btn.disabled=true;try{validate(pending);status('Preparing secure upload…');const signed=await request('/api/admin/media/sign','POST',{filename:pending.name,mime_type:pending.type,size:pending.size});const form=new FormData();for(const k of ['api_key','timestamp','folder','public_id','signature'])form.append(k,String(signed[k]));form.append('file',pending);status('Uploading to Cloudinary…');const r=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloud_name)}/image/upload`,{method:'POST',body:form});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?.message||'Cloudinary upload failed');status('Registering photograph…');const saved=await request('/api/admin/media','POST',{public_id:data.public_id,secure_url:data.secure_url,format:data.format,width:data.width,height:data.height,bytes:data.bytes,...readFields()});pending=null;$('cms-media-file').value='';await load();const found=items.find(x=>x.id===saved.id);if(found)select(found);status(`Photograph #${saved.id} uploaded successfully.`);}catch(e){status(`Upload failed: ${e.message}`);}finally{btn.disabled=false;}}
async function save(){if(!selected)return;const btn=$('cms-media-save');btn.disabled=true;try{const updated=await request(`/api/admin/media/${selected.id}`,'PATCH',readFields());const idx=items.findIndex(x=>x.id===selected.id);if(idx!==-1)items[idx]={...items[idx],...updated.item};select(items[idx]);render();status('Image details saved. Existing published article text is not changed.');}catch(e){status(`Could not save: ${e.message}`);}finally{btn.disabled=false;}}
async function removePhoto(){if(!selected)return;const item=selected;
 if(!confirm(`Move photograph #${item.id} to Trash? It can be restored later.`))return;
 const btn=$('cms-media-delete');btn.disabled=true;
 try{await request(`/api/admin/media/${item.id}`,'DELETE');selected=null;$('cms-media-selected-preview').replaceChildren();$('cms-media-details-heading').textContent='Image details';$('cms-media-save').hidden=true;$('cms-media-insert').hidden=true;btn.hidden=true;await load();await loadTrash();status(`Photograph #${item.id} moved to Trash.`);}catch(e){status(`Delete blocked: ${e.message}`);}finally{btn.disabled=false;}
}
function insert(){if(!selected)return;const editorButton=[...document.querySelectorAll('button')].find(b=>/Insert \/ edit image/i.test(b.textContent||''));if(editorButton){editorButton.click();status('Image picker opened. Select photograph #'+selected.id+' and click Insert / apply changes.');}else{navigator.clipboard?.writeText(String(selected.id)).then(()=>status(`Media ID ${selected.id} copied. Open the article editor to insert it.`)).catch(()=>status(`Media ID: ${selected.id}. Open the article editor to insert it.`));}}
$('cms-media-file').addEventListener('change',e=>{if(e.target.files?.[0])choose(e.target.files[0]);});const drop=$('cms-media-drop');drop.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===drop){e.preventDefault();$('cms-media-file').click();}});drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('is-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('is-over'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-over');if(e.dataTransfer?.files?.[0])choose(e.dataTransfer.files[0]);});$('cms-media-upload').addEventListener('click',upload);$('cms-media-save').addEventListener('click',save);$('cms-media-delete').addEventListener('click',removePhoto);$('cms-media-insert').addEventListener('click',insert);$('cms-media-refresh').addEventListener('click',()=>load());$('cms-media-more').addEventListener('click',()=>load(false));$('cms-media-search').addEventListener('input',e=>{query=e.target.value.toLowerCase().trim();render();});load();


function renderTrash(){
 const grid=$('cms-media-trash-gallery');grid.replaceChildren();
 for(const item of trashItems){
  const card=document.createElement('div');card.className='farm-media-trash-card';
  const img=imageEl(item);img.className='farm-media-trash-image';card.append(img);
  const desc=document.createElement('p');desc.textContent=`Photograph #${item.id} · Trashed ${item.deleted_at||'recently'}`;card.append(desc);
  const restore=document.createElement('button');restore.type='button';restore.textContent='Restore';restore.className='farm-media-secondary';
  restore.addEventListener('click',async()=>{restore.disabled=true;try{await request(`/api/admin/media/${item.id}/restore`,'POST');await Promise.all([load(),loadTrash()]);$('cms-media-trash-status').textContent=`Photograph #${item.id} restored.`;}catch(e){$('cms-media-trash-status').textContent=e.message;}finally{restore.disabled=false;}});
  card.append(restore);
  const purge=document.createElement('button');purge.type='button';purge.textContent='Permanently delete';purge.className='farm-media-secondary';
  // SQLite datetime values are UTC. Show the restriction clearly without changing server rules.
  const rawDate=String(item.deleted_at||'').trim();
  const normalizedDate=rawDate.includes('T')?rawDate:rawDate.replace(' ','T');
  const deleted=Date.parse(normalizedDate && !/(Z|[+-]\d{2}:?\d{2})$/i.test(normalizedDate)?normalizedDate+'Z':normalizedDate);
  const eligibleAt=Number.isFinite(deleted)?deleted+30*86400000:NaN;
  const eligible=Number.isFinite(eligibleAt)&&Date.now()>=eligibleAt;
  const restriction=document.createElement('p');
  restriction.className='farm-media-trash-restriction';
  restriction.style.cssText='font-size:0.82rem;line-height:1.5;margin:0.45rem 0 0;color:#5b675e;';
  if(!eligible){
   purge.disabled=true;
   purge.setAttribute('aria-disabled','true');
   purge.style.cssText='opacity:0.48;cursor:not-allowed;background:#e9e9e3;color:#5d665f;border-color:#c8cec6;';
   const available=Number.isFinite(eligibleAt)?new Date(eligibleAt).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}):null;
   restriction.textContent=available?`Permanent deletion available from ${available} (after 30 days).`:'Permanent deletion requires a valid Trash date and at least 30 days of retention.';
   purge.title=restriction.textContent;
  }else{
   restriction.textContent='Permanent deletion is irreversible and requires confirmation.';
   purge.title='Irreversible deletion from Cloudinary';
  }
  purge.addEventListener('click',async()=>{
   if(!eligible)return;
   if(!confirm(`Permanently delete photograph #${item.id} from Cloudinary? This cannot be undone.`))return;
   purge.disabled=true;
   try{await request(`/api/admin/media/${item.id}/purge`,'DELETE');await loadTrash();$('cms-media-trash-status').textContent=`Photograph #${item.id} permanently deleted.`;}
   catch(e){$('cms-media-trash-status').textContent=e.message;purge.disabled=false;}
  });
  card.append(purge,restriction);grid.append(card);
 }
 if(!trashItems.length){const p=document.createElement('p');p.textContent='Photograph Trash is empty.';grid.append(p);}
 $('cms-media-trash-more').hidden=!trashMore;
}
async function loadTrash(reset=true){
 try{if(reset){trashItems=[];trashOffset=0;}$('cms-media-trash-status').textContent='Loading Photograph Trash…';const data=await request(`/api/admin/media?trash=1&limit=60&offset=${trashOffset}`);trashItems.push(...(data.items||[]));trashOffset=trashItems.length;trashMore=Boolean(data.has_more);renderTrash();$('cms-media-trash-status').textContent=`${trashItems.length} photographs in Trash.`;}
 catch(e){$('cms-media-trash-status').textContent=`Could not load Photograph Trash: ${e.message}`;}
}
$('cms-media-trash-refresh').addEventListener('click',()=>loadTrash());
$('cms-media-trash-more').addEventListener('click',()=>loadTrash(false));
loadTrash();
