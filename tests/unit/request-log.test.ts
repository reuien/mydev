import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from '../../src/domain/errors';
import { handleRequest } from '../../src/middleware/error-handler';
import { logRequestError, withRequestLogging } from '../../src/middleware/request-log';
import { requestIdFor } from '../../src/middleware/request-id';

const id = '00000000-0000-4000-8000-000000000001';
afterEach(() => vi.restoreAllMocks());
function capture() {
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return { info, warn, error };
}

describe('request tracing', () => {
  it('reuses one generated ID for the same request and isolates other requests', () => {
    const request = new Request('https://local.test/');
    expect(requestIdFor(request)).toBe(requestIdFor(request));
    expect(requestIdFor(new Request('https://local.test/'))).not.toBe(requestIdFor(request));
  });
  it('preserves a valid supplied ID and replaces an invalid value', () => {
    expect(requestIdFor(new Request('https://local.test/', { headers: { 'X-Request-Id': id } }))).toBe(id);
    expect(requestIdFor(new Request('https://local.test/', { headers: { 'X-Request-Id': 'token-secret' } }))).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('adds ID and duration to successful page requests', async () => {
    const logs = capture();
    const response = await withRequestLogging(new Request('https://local.test/blog', { headers: { 'X-Request-Id': id } }),
      async () => new Response('Writing'));
    expect(response.headers.get('X-Request-Id')).toBe(id);
    expect(logs.info.mock.calls.map(([entry]) => JSON.parse(entry)).find((entry) => entry.event === 'request.completed')).toMatchObject({
      event: 'request.completed', requestId: id, method: 'GET', route: '/blog', status: 200,
      durationMs: expect.any(Number),
    });
  });
  it.each([404, 429, 503])('logs HTTP %s with its request ID', async (status) => {
    const logs = capture();
    const request = new Request('https://local.test/blog');
    const response = await withRequestLogging(request, async () => new Response(null, { status }));
    const entries = status >= 500 ? logs.error : logs.warn;
    expect(JSON.parse(entries.mock.calls[0][0])).toMatchObject({ status, requestId: response.headers.get('X-Request-Id') });
  });
  it('correlates handled storage failures with response and completion logs', async () => {
    const logs = capture();
    const request = new Request('https://local.test/api/public/posts/private-title?token=query-secret', {
      method: 'POST', headers: { Authorization: 'Bearer token-secret', Cookie: 'session=cookie-secret' }, body: 'body-secret',
    });
    const failure = new StorageUnavailableError('SQL with body-secret', { cause: new Error('no such table: private-title') });
    const response = await withRequestLogging(request, () => handleRequest(request, () => { throw failure; }));
    expect(response.status).toBe(503);
    const body = await response.json() as { error: { requestId: string } };
    expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
    const entries = logs.error.mock.calls.map(([entry]) => JSON.parse(entry));
    expect(entries[0]).toMatchObject({ event: 'request.error', source: 'public-api', diagnostic: 'DB_SCHEMA_MISSING',
      requestId: body.error.requestId, errorTypes: ['StorageUnavailableError', 'Error'] });
    const output = JSON.stringify(entries);
    for (const secret of ['query-secret', 'token-secret', 'cookie-secret', 'body-secret', 'private-title']) {
      expect(output).not.toContain(secret);
    }
  });
  it('returns a traceable safe 500 for an unexpected exception', async () => {
    const logs = capture();
    const response = await withRequestLogging(new Request('https://local.test/blog'), async () => { throw new Error('secret'); });
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toContain(response.headers.get('X-Request-Id'));
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain('secret');
  });
  it('records cache warnings without raw error messages', () => {
    const logs = capture();
    logRequestError(new Request('https://local.test/blog'), new Error('timeout with token-secret'), 'cache-write', 'warn');
    expect(JSON.parse(logs.warn.mock.calls[0][0])).toMatchObject({ source: 'cache-write', diagnostic: 'TIMEOUT' });
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain('token-secret');
  });
  it('does not fail requests if the logging sink throws', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => { throw new Error('sink unavailable'); });
    const response = await withRequestLogging(new Request('https://local.test/blog'), async () => new Response('ok'));
    expect(response.status).toBe(200);
  });
});
