import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PostService } from '../../src/application/post-service';
import { ProjectService } from '../../src/application/project-service';
import {
  createAuthorPost,
  createAuthorProject,
  deleteAuthorPost,
  transitionAuthorPost,
  updateAuthorPost,
  type AuthorHandlerContext,
} from '../../src/http/author-handlers';
import { SqlitePostRepository } from '../../src/repositories/sqlite/post-repository';
import { SqliteProjectRepository } from '../../src/repositories/sqlite/project-repository';
import { createSqliteTestDatabase, type SqliteTestDatabase } from '../helpers/sqlite-database';

const TOKEN = 'local-test-token';
const POST_ID = '00000000-0000-4000-8000-000000000077';
const PROJECT_ID = '10000000-0000-4000-8000-000000000077';

const postPayload = {
  slug: 'author-post',
  title: 'Author post',
  excerpt: 'Created through the author API.',
  bodyMarkdown: '# Author post',
  coverImageUrl: null,
};

const projectPayload = {
  slug: 'author-project',
  name: 'Author project',
  summary: 'Created through the author API.',
  bodyMarkdown: '# Author project',
  techStack: ['Astro'],
  codeUrl: null,
  demoUrl: null,
  coverImageUrl: null,
  sortOrder: 0,
};

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

function request(path: string, options: { method?: string; body?: unknown; token?: string; key?: string } = {}) {
  const headers = new Headers();
  if (options.token !== undefined) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.key) headers.set('Idempotency-Key', options.key);
  return new Request(`https://example.com${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

function emptyBodyRequest(path: string, token: string) {
  return new Request(`https://example.com${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: new Uint8Array(0),
  });
}

describe('author API', () => {
  let database: SqliteTestDatabase;
  let context: AuthorHandlerContext;

  beforeEach(() => {
    database = createSqliteTestDatabase();
    context = {
      posts: new PostService(new SqlitePostRepository(database.database), {
        now: () => '2026-09-07T00:00:00.000Z',
        generateId: () => POST_ID,
      }),
      projects: new ProjectService(new SqliteProjectRepository(database.database), {
        now: () => '2026-09-07T00:00:00.000Z',
        generateId: () => PROJECT_ID,
      }),
      expectedToken: TOKEN,
      clientKey: '127.0.0.1',
    };
  });

  afterEach(() => database.cleanup());

  it('returns identical unauthorized responses for missing and incorrect tokens', async () => {
    const missing = await createAuthorPost(request('/api/author/posts', { body: postPayload, key: 'key-1' }), context);
    const incorrect = await createAuthorPost(
      request('/api/author/posts', { body: postPayload, key: 'key-1', token: 'wrong' }),
      context,
    );

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(await errorCode(missing)).toBe(await errorCode(incorrect));
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
  });

  it('creates once and replays the first author post response', async () => {
    const first = await createAuthorPost(
      request('/api/author/posts', { body: postPayload, key: 'key-1', token: TOKEN }),
      context,
    );
    const replay = await createAuthorPost(
      request('/api/author/posts', { body: postPayload, key: 'key-1', token: TOKEN }),
      context,
    );

    expect(first.status).toBe(201);
    expect(first.headers.get('Location')).toBe(`/api/author/posts/${POST_ID}`);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
  });

  it('maps changed idempotent payloads and duplicate slugs to 409', async () => {
    await createAuthorPost(request('/api/author/posts', { body: postPayload, key: 'key-1', token: TOKEN }), context);
    const changed = await createAuthorPost(
      request('/api/author/posts', { body: { ...postPayload, title: 'Changed' }, key: 'key-1', token: TOKEN }),
      context,
    );
    const duplicate = await createAuthorPost(
      request('/api/author/posts', { body: postPayload, key: 'key-2', token: TOKEN }),
      { ...context, posts: new PostService(new SqlitePostRepository(database.database)) },
    );

    expect(await errorCode(changed)).toBe('IDEMPOTENCY_CONFLICT');
    expect(await errorCode(duplicate)).toBe('SLUG_CONFLICT');
  });

  it('validates content, supports update/publish/delete, and never caches writes', async () => {
    const invalid = await createAuthorPost(
      request('/api/author/posts', { body: { ...postPayload, unknown: true }, key: 'key-1', token: TOKEN }),
      context,
    );
    expect(invalid.status).toBe(400);

    await createAuthorPost(request('/api/author/posts', { body: postPayload, key: 'key-1', token: TOKEN }), context);
    const update = await updateAuthorPost(
      request(`/api/author/posts/${POST_ID}`, {
        method: 'PUT',
        token: TOKEN,
        body: { title: 'Updated', excerpt: postPayload.excerpt, bodyMarkdown: '# Updated', coverImageUrl: null },
      }),
      context,
      POST_ID,
    );
    const publish = await transitionAuthorPost(
      emptyBodyRequest(`/api/author/posts/${POST_ID}/publish`, TOKEN),
      context,
      POST_ID,
      'published',
    );
    const deleted = await deleteAuthorPost(
      request(`/api/author/posts/${POST_ID}`, { method: 'DELETE', token: TOKEN }),
      context,
      POST_ID,
    );

    expect(update.status).toBe(200);
    expect(publish.status).toBe(200);
    expect(deleted.status).toBe(204);
    expect(update.headers.get('Cache-Control')).toBe('no-store');
  });

  it('creates projects and returns 429 before authentication when rate limited', async () => {
    const created = await createAuthorProject(
      request('/api/author/projects', { body: projectPayload, key: 'project-key', token: TOKEN }),
      context,
    );
    const limited = await createAuthorProject(request('/api/author/projects'), {
      ...context,
      rateLimiter: { limit: async () => ({ success: false }) },
    });

    expect(created.status).toBe(201);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
  });
});
