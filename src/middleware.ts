import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { authenticateAdmin, adminRequestIsSameOrigin, isAdminPath } from './middleware/admin-auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const admin = isAdminPath(context.url.pathname);
  if (admin) {
    const actor = await authenticateAdmin(context.request, env);
    if (!actor || !adminRequestIsSameOrigin(context.request)) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
    }
    context.locals.adminEmail = actor;
  }
  const response = await next();
  if (admin) response.headers.set('Cache-Control', 'private, no-store');
  if (response.headers.get('Content-Type')?.includes('text/html')) {
    const upgradeRequests = context.url.protocol === 'https:' ? '; upgrade-insecure-requests' : '';
    response.headers.set('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src 'self' https://giscus.app; form-action 'self'; img-src 'self' https: data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' https://giscus.app; connect-src 'self' https://giscus.app" + upgradeRequests);
  }
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return response;
});
