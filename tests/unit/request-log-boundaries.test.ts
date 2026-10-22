import { afterEach, expect, it, vi } from 'vitest';
import { logRequestError, withRequestLogging } from '../../src/middleware/request-log';

function capture() {
  const entries: Record<string, unknown>[] = [];
  for (const level of ['info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((entry: string) => { entries.push(JSON.parse(entry)); });
  }
  return entries;
}
afterEach(() => vi.restoreAllMocks());

it.each([301, 302, 307, 308])('preserves immutable redirect %s and attaches request ID', async (status) => {
  const entries = capture();
  const response = await withRequestLogging(new Request('https://local.test/blog'),
    async () => Response.redirect('https://local.test/about', status));
  expect(response.status).toBe(status);
  expect(response.headers.get('Location')).toBe('https://local.test/about');
  expect(response.headers.get('X-Request-Id')).toMatch(/^[a-f0-9-]{36}$/);
  expect(entries.map((entry) => entry.event)).toEqual(['request.started', 'request.completed']);
});

it('keeps concurrent request logs separate and includes timestamps', async () => {
  const entries = capture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const first = withRequestLogging(new Request('https://local.test/blog'), async () => {
    await wait;
    return new Response('first');
  });
  const second = await withRequestLogging(new Request('https://local.test/projects'), async () => new Response('second'));
  release();
  const firstResponse = await first;
  const ids = [firstResponse, second].map((r) => r.headers.get('X-Request-Id'));
  expect(new Set(ids).size).toBe(2);
  for (const id of ids) {
    const related = entries.filter((entry) => entry.requestId === id);
    expect(related.map((entry) => entry.event)).toEqual(['request.started', 'request.completed']);
    expect(new Set(related.map((entry) => entry.route)).size).toBe(1);
    for (const entry of related) expect(Number.isFinite(Date.parse(entry.timestamp as string))).toBe(true);
  }
});

it.each([
  ['/blog/private-email@example.com', '/blog/:slug'],
  ['/projects/private-email@example.com', '/projects/:slug'],
  ['/api/public/posts/private-email@example.com', '/api/public/posts/:slug'],
  ['/api/author/posts/private-email@example.com/publish', '/api/author/posts/:id/publish'],
  ['/api/author/posts/by-slug/private-email@example.com', '/api/author/posts/by-slug/:slug'],
  ['/private-email@example.com', '/:other'],
])('masks dynamic route %s across all request logs', async (path, expected) => {
  const entries = capture();
  const request = new Request(`https://local.test${path}?password=hidden-password`, {
    method: 'POST',
    headers: { 'X-Request-Id': 'hidden-client-id', Authorization: 'Bearer hidden-token',
      Cookie: 'session=hidden-cookie', 'X-Forwarded-For': '198.51.100.29' },
    body: '{"email":"private-email@example.com","password":"hidden-body"}',
  });
  await withRequestLogging(request, async () => {
    const error = new Error('hidden-error-message');
    error.name = 'hidden-error-type';
    error.stack = 'hidden-stack';
    logRequestError(request, error, 'hidden-source');
    return new Response('ok', { headers: { 'Set-Cookie': 'session=hidden-response-cookie' } });
  });
  const output = JSON.stringify(entries);
  for (const entry of entries) expect(entry.route).toBe(expected);
  expect(output).not.toMatch(/private-email|hidden-|198\.51\.100\.29/);
  expect(entries.find((entry) => entry.event === 'request.error')?.source).toBe('application');
});

it('does not traverse arbitrary thrown objects or invoke their serialization hooks', async () => {
  const entries = capture();
  const serialize = vi.fn(() => { throw new Error('sensitive-value'); });
  const response = await withRequestLogging(new Request('https://local.test/blog'), async () => {
    throw { password: 'sensitive-value', toJSON: serialize, toString: serialize };
  });
  expect(response.status).toBe(500);
  expect(serialize).not.toHaveBeenCalled();
  expect(JSON.stringify(entries)).not.toContain('sensitive-value');
});

it('handles throwing error getters without leaking or escaping the logger', () => {
  const entries = capture();
  const error = new Error('sensitive-value');
  Object.defineProperty(error, 'message', { get() { throw new Error('sensitive-getter'); } });
  expect(() => logRequestError(new Request('https://local.test/blog'), error, 'public-api')).not.toThrow();
  expect(entries[0].diagnostic).toBe('ERROR_DETAILS_UNAVAILABLE');
  expect(JSON.stringify(entries)).not.toContain('sensitive-');
});

it('bounds cyclic error chains and never records stack or raw nested messages', () => {
  const entries = capture();
  const error = new Error('sensitive-message');
  error.cause = error;
  logRequestError(new Request('https://local.test/blog'), error, 'public-api');
  expect(entries[0].errorTypes).toEqual(['Error']);
  expect(JSON.stringify(entries)).not.toContain('sensitive-message');
});

it('returns a bodyless traceable error response for HEAD', async () => {
  capture();
  const response = await withRequestLogging(new Request('https://local.test/blog', { method: 'HEAD' }), async () => { throw new Error('hidden'); });
  expect(response.status).toBe(500);
  expect(response.headers.get('X-Request-Id')).toBeTruthy();
  expect(await response.text()).toBe('');
});
