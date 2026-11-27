export async function onRequest(context) {
  const url = new URL(context.request.url);
  const production = new Set(['www.anjumultipurposefarm.com.np', 'anjumultipurposefarm.com.np']).has(url.hostname);
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (new URL(context.request.url).pathname.startsWith('/api/admin/')) headers.set('Cache-Control', 'no-store');
  if (!production || /^\/(?:admin|api)(?:\/|$)/.test(url.pathname)) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
