const productionHosts = new Set(['www.anjumultipurposefarm.com.np','anjumultipurposefarm.com.np']);
export function mediaFolder(request, env) {
  const production = productionHosts.has(new URL(request.url).hostname);
  const expected = production ? 'production' : 'staging';
  // Explicit production configuration is mandatory; existing staging remains compatible.
  if (production ? env.MEDIA_ENV !== expected : (env.MEDIA_ENV && env.MEDIA_ENV !== expected)) return null;
  return `anju-farm/${expected}`;
}
export function ownsMedia(folder, id) {
  return !!folder && typeof id === 'string' && id.startsWith(folder + '/') && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id.slice(folder.length + 1));
}
