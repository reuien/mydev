import { requestIdFor } from './request-id';

const sources = new Set(['public-api', 'author-api', 'blog-page', 'middleware',
  'cache-read', 'cache-write', 'cache-invalidate', 'cache-fallback-version', 'storage-stale-fallback', 'post-groups-fallback']);

const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'StorageUnavailableError',
  'SlugConflictError', 'IdempotencyConflictError', 'DomainError']);

// Log route templates, not query strings, credentials, article slugs or bodies.
function routeFor(request: Request): string {
  const path = new URL(request.url).pathname;
  if (['/', '/blog', '/projects', '/about', '/contact', '/admin'].includes(path)) return path;
  if (/^\/(blog|projects)\/[^/]+\/?$/.test(path)) return `/${path.split('/')[1]}/:slug`;
  const api = path.match(/^\/api\/(public|author)\/(posts|projects|post-groups)(.*)$/);
  if (api) {
    const [, audience, resource, suffix] = api;
    const base = `/api/${audience}/${resource}`;
    if (!suffix || suffix === '/') return base;
    if (/^\/by-slug\/[^/]+$/.test(suffix)) return `${base}/by-slug/:slug`;
    if (/^\/[^/]+(?:\/(?:publish|unpublish))?$/.test(suffix)) {
      const action = suffix.match(/\/(publish|unpublish)$/)?.[1];
      return `${base}/${audience === 'public' ? ':slug' : ':id'}${action ? `/${action}` : ''}`;
    }
    return '/api/:other';
  }
  return '/:other';
}
function fields(request: Request) {
  return {
    requestId: requestIdFor(request),
    method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method) ? request.method : 'OTHER',
    route: routeFor(request),
  };
}
function write(level: 'info' | 'warn' | 'error', entry: Record<string, unknown>) {
  try { console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, ...entry })); } catch { /* Logging cannot break requests. */ }
}
function describeError(error: unknown) {
  const chain: string[] = [];
  let diagnostic = 'UNCLASSIFIED';
  const seen = new Set<unknown>();
  let current = error;
  try {
    while (current instanceof Error && chain.length < 4 && !seen.has(current)) {
      seen.add(current);
      const name = current.name;
      chain.push(errorTypes.has(name) ? name : 'Error');
      // No string conversion of arbitrary objects or recording raw messages/stacks.
      const message = typeof current.message === 'string' ? current.message.slice(0, 2048) : '';
      if (/no such (table|column)/i.test(message)) diagnostic = 'DB_SCHEMA_MISSING';
      else if (/constraint failed/i.test(message)) diagnostic = 'DB_CONSTRAINT';
      else if (/timeout|timed out/i.test(message)) diagnostic = 'TIMEOUT';
      else if (/binding|reading 'prepare'/i.test(message)) diagnostic = 'BINDING_UNAVAILABLE';
      current = current.cause;
    }
  } catch {
    // Even an exception with throwing getters must not break its error handler.
    diagnostic = 'ERROR_DETAILS_UNAVAILABLE';
  }
  return { errorTypes: chain.length ? chain : ['UnknownError'], diagnostic };
}

export function logRequestError(request: Request, error: unknown, source: string, level: 'warn' | 'error' = 'error') {
  try {
    write(level, { event: 'request.error', ...fields(request),
      source: sources.has(source) ? source : 'application', ...describeError(error) });
  } catch { /* Diagnostics must never change application behavior. */ }
}

function attachRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set('X-Request-Id', requestId);
    return response;
  } catch {
    // Response.redirect() and fetch() responses can have immutable headers.
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

export async function withRequestLogging(request: Request, operation: () => Promise<Response>): Promise<Response> {
  const started = performance.now();
  const requestId = requestIdFor(request);
  write('info', { event: 'request.started', ...fields(request) });
  try {
    const response = attachRequestId(await operation(), requestId);
    const status = response.status;
    write(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', {
      event: 'request.completed', ...fields(request), status,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    });
    return response;
  } catch (error) {
    logRequestError(request, error, 'middleware');
    write('error', { event: 'request.failed', ...fields(request), status: 500,
      durationMs: Math.round((performance.now() - started) * 100) / 100 });
    return new Response(request.method === 'HEAD' ? null : `服务暂时不可用。请求编号：${requestId}`, {
      status: 500,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    });
  }
}
