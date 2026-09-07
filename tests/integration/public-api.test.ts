import { describe, expect, it, vi } from 'vitest';

import type { PostService } from '../../src/application/post-service';
import type { ProjectService } from '../../src/application/project-service';
import { StorageUnavailableError } from '../../src/domain/errors';
import { postFixture } from '../fixtures/posts';
import { projectFixture } from '../fixtures/projects';
import { createTestApp } from '../helpers/test-app';

function services() {
  return {
    posts: {
      listPublic: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      getPublicBySlug: vi.fn().mockResolvedValue(null),
    } as unknown as PostService,
    projects: {
      listPublic: vi.fn().mockResolvedValue([]),
      getPublicBySlug: vi.fn().mockResolvedValue(null),
    } as unknown as ProjectService,
  };
}

describe('public API', () => {
  it('returns normalized post pagination, envelope, cache, and request ID', async () => {
    const apiServices = services();
    vi.mocked(apiServices.posts.listPublic).mockResolvedValue({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          slug: 'post',
          title: 'Post',
          excerpt: 'Summary',
          coverImageUrl: null,
          publishedAt: '2026-09-07T00:00:00.000Z',
          updatedAt: '2026-09-07T00:00:00.000Z',
        },
      ],
      total: 11,
    });
    const response = await createTestApp(apiServices).fetch(
      new Request('https://example.com/api/public/posts?page=2&pageSize=10', {
        headers: { 'X-Request-Id': '818ec24d-92bf-4e24-a2f3-36d22acdb769' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=30');
    expect(response.headers.get('X-Request-Id')).toBe('818ec24d-92bf-4e24-a2f3-36d22acdb769');
    await expect(response.json()).resolves.toMatchObject({ meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 } });
    expect(apiServices.posts.listPublic).toHaveBeenCalledWith({ limit: 10, offset: 10 });
  });

  it.each([
    '?page=0',
    '?page=+1',
    '?pageSize=51',
    '?page=1&page=2',
    '?page=9007199254740991&pageSize=50',
    '?unknown=1',
  ])('rejects invalid pagination %s', async (query) => {
    const response = await createTestApp(services()).fetch(new Request(`https://example.com/api/public/posts${query}`));

    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns a public post without internal fields', async () => {
    const apiServices = services();
    vi.mocked(apiServices.posts.getPublicBySlug).mockResolvedValue(
      postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' }),
    );
    const response = await createTestApp(apiServices).fetch(new Request('https://example.com/api/public/posts/first-post'));
    const body = (await response.json()) as { data: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.data).not.toHaveProperty('status');
    expect(body.data).not.toHaveProperty('createdAt');
    expect(body.data).toHaveProperty('bodyMarkdown', '# Hello');
  });

  it('uses indistinguishable no-store 404s for missing or invalid post slugs', async () => {
    const app = createTestApp(services());
    const missing = await app.fetch(new Request('https://example.com/api/public/posts/missing'));
    const invalid = await app.fetch(new Request('https://example.com/api/public/posts/INVALID'));

    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('no-store');
    const missingBody = (await missing.json()) as { error: { code: string } };
    const invalidBody = (await invalid.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe(invalidBody.error.code);
  });

  it('returns project lists and details using the public cache policy', async () => {
    const apiServices = services();
    const project = projectFixture();
    vi.mocked(apiServices.projects.listPublic).mockResolvedValue([{ ...project, bodyMarkdown: undefined } as never]);
    vi.mocked(apiServices.projects.getPublicBySlug).mockResolvedValue(project);
    const app = createTestApp(apiServices);

    expect((await app.fetch(new Request('https://example.com/api/public/projects'))).status).toBe(200);
    expect((await app.fetch(new Request('https://example.com/api/public/projects/first-project'))).status).toBe(200);
  });

  it('maps storage failures to a request-correlated 503', async () => {
    const apiServices = services();
    vi.mocked(apiServices.posts.listPublic).mockRejectedValue(new StorageUnavailableError('offline'));
    const response = await createTestApp(apiServices).fetch(new Request('https://example.com/api/public/posts'));
    const body = (await response.json()) as { error: { code: string; requestId: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('STORAGE_UNAVAILABLE');
    expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
