// Staging-only authenticated Cloudinary upload widget. No publication side effects.
const $ = id => document.getElementById(id);
const button = $('cms-media-upload');
const status = $('cms-media-status');
const result = $('cms-media-result');
const types = new Set(['image/jpeg','image/png','image/webp','image/avif']);
async function jsonRequest(url, payload) {
  const response = await fetch(url, {method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const data = await response.json().catch(()=>({error:'Unexpected server response'}));
  if(!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
if (button) button.addEventListener('click', async () => {
  const file = $('cms-media-file').files?.[0];
  if(!file || !types.has(file.type) || file.size < 1 || file.size > 10000000) {status.textContent='Select a supported image smaller than 10 MB.';return;}
  button.disabled=true;result.replaceChildren();status.textContent='Requesting signed upload…';
  try {
    const signed = await jsonRequest('/api/admin/media/sign',{filename:file.name,mime_type:file.type,size:file.size});
    const form = new FormData();
    for (const key of ['api_key','timestamp','folder','public_id','signature']) form.append(key,String(signed[key]));
    form.append('file',file);
    status.textContent='Uploading image…';
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloud_name)}/image/upload`,{method:'POST',body:form});
    const uploaded = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(uploaded.error?.message || 'Cloudinary upload failed');
    status.textContent='Registering image…';
    const saved = await jsonRequest('/api/admin/media',{public_id:uploaded.public_id,secure_url:uploaded.secure_url,format:uploaded.format,width:uploaded.width,height:uploaded.height,bytes:uploaded.bytes,alt_en:$('cms-media-alt-en').value.trim(),alt_ne:$('cms-media-alt-ne').value.trim(),caption_en:$('cms-media-caption-en').value.trim(),caption_ne:$('cms-media-caption-ne').value.trim()});
    const image = document.createElement('img');image.src=saved.secure_url;image.alt=$('cms-media-alt-en').value.trim()||'Uploaded image';image.style.maxWidth='280px';image.style.height='auto';
    const label=document.createElement('p');label.textContent=`Saved media ID: ${saved.id}`;
    result.append(image,label);status.textContent='Image uploaded and registered in staging media library.';
  } catch(error) {status.textContent=`Upload failed: ${error.message}`;} finally {button.disabled=false;}
});
