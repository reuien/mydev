import { describe, expect, it, vi } from 'vitest';

import { PostService } from '../../src/application/post-service';
import type { PostRepository } from '../../src/repositories/post-repository';
import { postFixture } from '../fixtures/posts';

function repositoryMock(): PostRepository {
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

describe('PostService', () => {
  it('creates posts as drafts using injected identity and time', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.create).mockImplementation(async (post) => post);
    const service = new PostService(repository, {
      now: () => '2026-09-07T00:00:00.000Z',
      generateId: () => '00000000-0000-4000-8000-000000000009',
    });

    const created = await service.create({
      slug: 'new-post',
      title: 'New post',
      excerpt: 'Summary',
      bodyMarkdown: '# New',
      coverImageUrl: null,
      groupId: null,
    });

    expect(created).toMatchObject({ status: 'draft', publishedAt: null });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000009',
        createdAt: '2026-09-07T00:00:00.000Z',
      }),
    );
  });

  it('uses repository-level published filtering for public reads', async () => {
    const repository = repositoryMock();
    vi.mocked(repository.findPublicBySlug).mockResolvedValue(null);
    const service = new PostService(repository, {
      now: () => '2026-09-07T00:00:00.000Z',
      generateId: () => crypto.randomUUID(),
    });

    await expect(service.getPublicBySlug('draft')).resolves.toBeNull();
    expect(repository.findPublicBySlug).toHaveBeenCalledWith('draft');
    expect(repository.findAuthorBySlug).not.toHaveBeenCalled();
  });

  it('delegates idempotent publish and unpublish transitions with one clock value', async () => {
    const repository = repositoryMock();
    const published = postFixture({ status: 'published', publishedAt: '2026-09-07T01:00:00.000Z' });
    vi.mocked(repository.transitionStatus).mockResolvedValue(published);
    const service = new PostService(repository, {
      now: () => '2026-09-07T01:00:00.000Z',
      generateId: () => crypto.randomUUID(),
    });

    await expect(service.publish(published.id)).resolves.toEqual(published);
    await service.unpublish(published.id);
    expect(repository.transitionStatus).toHaveBeenNthCalledWith(1, published.id, 'published', '2026-09-07T01:00:00.000Z');
    expect(repository.transitionStatus).toHaveBeenNthCalledWith(2, published.id, 'draft', '2026-09-07T01:00:00.000Z');
  });
});
