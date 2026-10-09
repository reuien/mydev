import { describe, expect, it, vi } from 'vitest';

import { StorageUnavailableError } from '../../src/domain/errors';
import type { PostGroupRepository } from '../../src/repositories/post-group-repository';
import type { PostRepository } from '../../src/repositories/post-repository';
import { MemoryPostQueryCache, PostQueryService } from '../../src/services/post-query';
import { postFixture } from '../fixtures/posts';

function postRepository(): PostRepository {
  return {
    create: vi.fn(),
    findAuthorById: vi.fn(),
    findAuthorBySlug: vi.fn(),
    findPublicBySlug: vi.fn(),
    listPublic: vi.fn(),
    updateContent: vi.fn(),
    transitionStatus: vi.fn(),
    delete: vi.fn(),
    createIdempotently: vi.fn(),
  };
}

function groupRepository(): PostGroupRepository {
  return { create: vi.fn(), findById: vi.fn(), findBySlug: vi.fn(), list: vi.fn().mockResolvedValue([]) };
}

describe('PostQueryService', () => {
  it('shares fresh public detail results instead of querying storage twice', async () => {
    const posts = postRepository();
    const published = postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' });
    vi.mocked(posts.findPublicBySlug).mockResolvedValue(published);
    const queries = new PostQueryService(posts, groupRepository(), new MemoryPostQueryCache(), () => 1_000);

    await expect(queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
    await expect(queries.getPublicBySlug(published.slug)).resolves.toEqual(published);

    expect(posts.findPublicBySlug).toHaveBeenCalledTimes(1);
  });

  it('returns stale cached content when D1 is temporarily unavailable', async () => {
    const posts = postRepository();
    const published = postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' });
    vi.mocked(posts.findPublicBySlug)
      .mockResolvedValueOnce(published)
      .mockRejectedValueOnce(new StorageUnavailableError('offline'));
    let now = 1_000;
    const queries = new PostQueryService(posts, groupRepository(), new MemoryPostQueryCache(), () => now, 300);

    await queries.getPublicBySlug(published.slug);
    now += 301_000;

    await expect(queries.getPublicBySlug(published.slug)).resolves.toEqual(published);
    expect(posts.findPublicBySlug).toHaveBeenCalledTimes(2);
  });

  it('preserves a storage failure on a cold cache miss', async () => {
    const posts = postRepository();
    vi.mocked(posts.findPublicBySlug).mockRejectedValue(new StorageUnavailableError('offline'));
    const queries = new PostQueryService(posts, groupRepository(), new MemoryPostQueryCache());

    await expect(queries.getPublicBySlug('missing')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('invalidates list and detail entries by advancing the cache generation', async () => {
    const posts = postRepository();
    const published = postFixture({ status: 'published', publishedAt: '2026-09-07T00:00:00.000Z' });
    vi.mocked(posts.findPublicBySlug).mockResolvedValue(published);
    const cache = new MemoryPostQueryCache();
    const queries = new PostQueryService(posts, groupRepository(), cache);

    await queries.getPublicBySlug(published.slug);
    await queries.getPublicBySlug(published.slug);
    await cache.invalidate();
    await queries.getPublicBySlug(published.slug);

    expect(posts.findPublicBySlug).toHaveBeenCalledTimes(2);
  });
});
