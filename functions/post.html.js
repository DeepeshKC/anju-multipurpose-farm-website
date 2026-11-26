export function onRequestGet({request}) {
  const url = new URL(request.url);
  url.pathname = '/post';
  return Response.redirect(url.toString(), 308);
}
