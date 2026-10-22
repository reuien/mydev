import { describe, expect, it, vi } from 'vitest';
import { StorageUnavailableError } from '../../src/domain/errors';
import { CloudflarePostQueryCache, MemoryPostQueryCache, PostQueryService } from '../../src/services/post-query';
import type { PostRepository } from '../../src/repositories/post-repository';
import type { PostGroupRepository } from '../../src/repositories/post-group-repository';
import { postFixture } from '../fixtures/posts';

function edgeCache() {
  const entries = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); }),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const published = postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' });

for (const kind of ['memory', 'edge']) {
  describe(`${kind} cache races`, () => {
    function harness() {
      const cache = kind === 'memory' ? new MemoryPostQueryCache()
        : new CloudflarePostQueryCache(edgeCache() as unknown as Cache);
      const detail = vi.fn();
      const list = vi.fn();
      const posts = { findPublicBySlug: detail, listPublic: list } as unknown as PostRepository;
      const groups = { list: vi.fn().mockResolvedValue([]) } as unknown as PostGroupRepository;
      let now = 0;
      const report = vi.fn();
      return { cache, detail, list, report, queries: new PostQueryService(posts, groups, cache, () => now, 1, report),
        expire: () => { now += 2_000; } };
    }
    it('reports storage failure even when stale fallback keeps the request successful', async () => {
      const h = harness();
      const error = new StorageUnavailableError('offline');
      h.detail.mockResolvedValueOnce(published).mockRejectedValueOnce(error);
      await h.queries.getPublicBySlug(published.slug);
      h.expire();
      await expect(h.queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
      expect(h.report).toHaveBeenCalledWith(error, 'storage-stale-fallback');
    });
    it('does not promote an in-flight old article into the new generation', async () => {
      const h = harness(), read = deferred<typeof published>();
      h.detail.mockReturnValueOnce(read.promise).mockResolvedValue(null);
      const request = h.queries.getPublicBySlug(published.slug);
      await vi.waitFor(() => expect(h.detail).toHaveBeenCalledTimes(1));
      await h.cache.invalidate();
      read.resolve(published);
      await request;
      await expect(h.queries.getPublicBySlug(published.slug)).resolves.toBeNull();
      expect(h.detail).toHaveBeenCalledTimes(2);
    });
    it('does not fall back to a generation invalidated during a failed read', async () => {
      const h = harness(), read = deferred<never>();
      h.detail.mockResolvedValueOnce(published).mockReturnValueOnce(read.promise);
      await h.queries.getPublicBySlug(published.slug);
      h.expire();
      const request = h.queries.getPublicBySlug(published.slug);
      // Attach rejection handling before releasing the deferred read.
      const assertion = expect(request).rejects.toBeInstanceOf(StorageUnavailableError);
      await vi.waitFor(() => expect(h.detail).toHaveBeenCalledTimes(2));
      await h.cache.invalidate();
      read.reject(new StorageUnavailableError('offline'));
      await assertion;
    });
    it('replaces a stale article when storage confirms deletion', async () => {
      const h = harness();
      h.detail.mockResolvedValueOnce(published).mockResolvedValueOnce(null)
        .mockRejectedValue(new StorageUnavailableError('offline'));
      await h.queries.getPublicBySlug(published.slug);
      h.expire();
      await expect(h.queries.getPublicBySlug(published.slug)).resolves.toBeNull();
      expect(await h.cache.get(`detail:${published.slug}`)).toMatchObject({ value: null });
      await expect(h.queries.getPublicBySlug(published.slug)).resolves.toBeNull();
      expect(h.detail).toHaveBeenCalledTimes(3);
    });
    it('replaces a stale list when the last article is removed', async () => {
      const h = harness();
      h.list.mockResolvedValueOnce({ items: [published], total: 1 })
        .mockResolvedValueOnce({ items: [], total: 0 }).mockRejectedValue(new StorageUnavailableError('offline'));
      await h.queries.listPublic({ limit: 10, offset: 0 });
      h.expire();
      await h.queries.listPublic({ limit: 10, offset: 0 });
      expect(await h.cache.get('list:10:0')).toMatchObject({ value: { items: [], total: 0 } });
      await expect(h.queries.listPublic({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], total: 0 });
      expect(h.list).toHaveBeenCalledTimes(3);
    });
    it('reports cache degradation without breaking a successful source read', async () => {
      const h = harness();
      const report = vi.fn();
      const failure = new Error('cache unavailable');
      vi.spyOn(h.cache, 'version').mockRejectedValue(failure);
      h.detail.mockResolvedValue(published);
      const queries = new PostQueryService({ findPublicBySlug: h.detail } as unknown as PostRepository,
        {} as PostGroupRepository, h.cache, undefined, undefined, report);
      await expect(queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
      expect(report).toHaveBeenCalledWith(failure, 'cache-read');
    });
    it('still reads storage when the cache version lookup fails', async () => {
      const h = harness();
      vi.spyOn(h.cache, 'version').mockRejectedValue(new Error('cache offline'));
      h.detail.mockResolvedValue(published);
      await expect(h.queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
    });
  });
}

it('does not create or overwrite a version on cold edge reads', async () => {
  const storage = edgeCache();
  const cache = new CloudflarePostQueryCache(storage as unknown as Cache);
  await expect(cache.version()).resolves.toBe('initial');
  expect(storage.put).not.toHaveBeenCalled();
  await cache.invalidate();
  const version = await cache.version();
  expect(version).not.toBe('initial');
  await cache.get('missing');
  expect(await cache.version()).toBe(version);
});
