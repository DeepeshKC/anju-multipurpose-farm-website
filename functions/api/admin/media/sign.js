
import {reply,guard,sameOrigin} from '../../../_shared.js';

const validName = name =>
  typeof name === 'string' &&
  name.trim().length > 0 &&
  name.length <= 255 &&
  !/[/\\\u0000-\u001F\u007F]/u.test(name);

const allowed = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
]);

const MAX_BYTES = 10000000;

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map(b => b.toString(16).padStart(2,'0'))
    .join('');
}

export async function onRequestPost(ctx) {
  const denied = await guard(ctx);
  if (denied) return denied;

  if (!sameOrigin(ctx.request))
    return reply({error:'Invalid origin'},403);

  const {
    CLOUDINARY_CLOUD_NAME:cloud,
    CLOUDINARY_API_KEY:key,
    CLOUDINARY_API_SECRET:secret
  } = ctx.env;

  if (!cloud || !key || !secret)
    return reply({error:'Cloudinary is not configured'},503);

  let data;

  try {
    data = await ctx.request.json();
  } catch {
    return reply({error:'Invalid request'},400);
  }

  if (!validName(data?.filename))
    return reply({error:'Invalid image filename.'},400);

  if (!allowed.has(data?.mime_type))
    return reply({error:'Unsupported image format. Use JPEG, PNG, WebP or AVIF.'},400);

  if (!Number.isSafeInteger(data?.size) || data.size < 1)
    return reply({error:'Invalid image file size.'},400);

  if (data.size > MAX_BYTES)
    return reply({error:'Image exceeds the 10 MB upload limit.'},400);

  const timestamp = Math.floor(Date.now()/1000);
  const folder = 'anju-farm/staging';
  const public_id = crypto.randomUUID();

  const params = `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}`;
  const payload = new TextEncoder().encode(params+secret);
  const signature = hex(await crypto.subtle.digest('SHA-1',payload));

  return reply({
    cloud_name:cloud,
    api_key:key,
    timestamp,
    folder,
    public_id,
    signature,
    max_bytes:MAX_BYTES
  });
}
