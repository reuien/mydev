import type { D1Database } from '@cloudflare/workers-types';
import { describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from '../../src/domain/errors';
import { D1PostRepository } from '../../src/repositories/d1/post-repository';
import type { PostRepository } from '../../src/repositories/post-repository';
import type { PostGroupRepository } from '../../src/repositories/post-group-repository';
import { CloudflarePostQueryCache, MemoryPostQueryCache, PostQueryService } from '../../src/services/post-query';
import { postFixture } from '../fixtures/posts';

const published = postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' });
function services() {
  const list = vi.fn().mockResolvedValue({ items: [published], total: 1 });
  const groups = vi.fn();
  const report = vi.fn();
  const queries = new PostQueryService({ listPublic: list } as unknown as PostRepository,
    { list: groups } as unknown as PostGroupRepository, new MemoryPostQueryCache(), undefined, undefined, report);
  return { list, groups, report, queries };
}

describe('blog availability', () => {
  it('keeps articles visible when optional group lookup fails', async () => {
    const h = services(), error = new StorageUnavailableError('group unavailable');
    h.groups.mockRejectedValue(error);
    await expect(h.queries.listBlogPage({ limit: 10, offset: 0 })).resolves.toEqual({ items: [published], total: 1, groups: [] });
    expect(h.report).toHaveBeenCalledWith(error, 'post-groups-fallback');
  });
  it('recovers group names on the next request instead of caching missing names', async () => {
    const h = services();
    h.groups.mockRejectedValueOnce(new StorageUnavailableError('offline')).mockResolvedValueOnce([{ id: 'group', name: 'Engineering' }]);
    await h.queries.listBlogPage({ limit: 10, offset: 0 });
    await expect(h.queries.listBlogPage({ limit: 10, offset: 0 })).resolves.toMatchObject({ groups: [{ name: 'Engineering' }] });
    expect(h.list).toHaveBeenCalledTimes(1);
  });
  it('does not disguise an article storage outage as an empty blog', async () => {
    const h = services();
    h.list.mockRejectedValue(new StorageUnavailableError('offline')); h.groups.mockResolvedValue([]);
    await expect(h.queries.listBlogPage({ limit: 10, offset: 0 })).rejects.toBeInstanceOf(StorageUnavailableError);
  });
  it('does not swallow a programming error in the group lookup', async () => {
    const h = services(); h.groups.mockRejectedValue(new TypeError('bug'));
    await expect(h.queries.listBlogPage({ limit: 10, offset: 0 })).rejects.toBeInstanceOf(TypeError);
  });
  it.each([{ freshUntil: 9999999999999 }, { value: {}, freshUntil: 'invalid' }, null])('bypasses corrupt cache envelope %j', async (entry) => {
    const cache = new CloudflarePostQueryCache({
      match: async (request: Request) => request.url.endsWith('/version') ? undefined : Response.json(entry),
      put: vi.fn(),
    } as unknown as Cache);
    const report = vi.fn(), detail = vi.fn().mockResolvedValue(published);
    const queries = new PostQueryService({ findPublicBySlug: detail } as unknown as PostRepository,
      {} as PostGroupRepository, cache, undefined, undefined, report);
    await expect(queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
    expect(report).toHaveBeenCalledWith(expect.any(TypeError), 'cache-read');
  });
});

function database() {
  const first = vi.fn(), all = vi.fn(), run = vi.fn();
  const statement = { bind: () => statement, first, all, run };
  return { first, all, run, repo: new D1PostRepository({ prepare: () => statement } as unknown as D1Database) };
}
describe('bounded D1 read retries', () => {
  it('recovers from one transient detail read failure', async () => {
    const h = database(); h.first.mockRejectedValueOnce(new Error('D1_ERROR: connection reset')).mockResolvedValueOnce(null);
    await expect(h.repo.findPublicBySlug('missing')).resolves.toBeNull();
    expect(h.first).toHaveBeenCalledTimes(2);
  });
  it('recovers a transient article list read failure', async () => {
    const h = database(); h.all.mockRejectedValueOnce(new Error('D1_ERROR: overloaded')).mockResolvedValueOnce({ results: [] });
    h.first.mockResolvedValue({ total: 0 });
    await expect(h.repo.listPublic({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], total: 0 });
    expect(h.all).toHaveBeenCalledTimes(2);
  });
  it('stops after the second transient failure', async () => {
    const h = database(); h.first.mockRejectedValue(new Error('D1_ERROR: timeout'));
    await expect(h.repo.findPublicBySlug('post')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(h.first).toHaveBeenCalledTimes(2);
  });
  it.each(['no such table: posts', 'SQLITE_CONSTRAINT: constraint failed', 'invalid SQL'])('does not retry permanent failure %s', async (message) => {
    const h = database(); h.first.mockRejectedValue(new Error(message));
    await expect(h.repo.findPublicBySlug('post')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(h.first).toHaveBeenCalledTimes(1);
  });
  it('does not retry writes automatically', async () => {
    const h = database(); h.run.mockRejectedValue(new Error('D1_ERROR: timeout'));
    await expect(h.repo.create(postFixture())).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(h.run).toHaveBeenCalledTimes(1);
  });
});
