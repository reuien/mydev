import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SlugConflictError } from '../../src/domain/errors';
import type { PostRepository } from '../../src/repositories/post-repository';
import { postFixture } from '../fixtures/posts';

type Harness = { repository: PostRepository; cleanup: () => void | Promise<void> };

export function runPostRepositoryContract(name: string, createHarness: () => Harness | Promise<Harness>): void {
  describe(`${name} PostRepository contract`, () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness?.cleanup();
    });

    it('creates, reads, updates, and deletes an author post', async () => {
      const post = postFixture();
      await expect(harness.repository.create(post)).resolves.toEqual(post);
      await expect(harness.repository.findAuthorById(post.id)).resolves.toEqual(post);
      await expect(harness.repository.findAuthorBySlug(post.slug)).resolves.toEqual(post);

      const updated = await harness.repository.updateContent(
        post.id,
        { title: 'Updated', excerpt: post.excerpt, bodyMarkdown: 'Updated body', coverImageUrl: null },
        '2026-09-07T01:00:00.000Z',
      );
      expect(updated).toMatchObject({ title: 'Updated', updatedAt: '2026-09-07T01:00:00.000Z' });
      await expect(harness.repository.delete(post.id)).resolves.toBe(true);
      await expect(harness.repository.findAuthorById(post.id)).resolves.toBeNull();
      await expect(harness.repository.delete(post.id)).resolves.toBe(false);
    });

    it('isolates drafts and transitions status idempotently', async () => {
      const post = postFixture();
      await harness.repository.create(post);
      await expect(harness.repository.findPublicBySlug(post.slug)).resolves.toBeNull();

      const published = await harness.repository.transitionStatus(post.id, 'published', '2026-09-07T01:00:00.000Z');
      expect(published).toMatchObject({ status: 'published', publishedAt: '2026-09-07T01:00:00.000Z' });
      await expect(harness.repository.transitionStatus(post.id, 'published', '2026-09-07T02:00:00.000Z')).resolves.toEqual(
        published,
      );
      await expect(harness.repository.findPublicBySlug(post.slug)).resolves.toEqual(published);

      const draft = await harness.repository.transitionStatus(post.id, 'draft', '2026-09-07T03:00:00.000Z');
      expect(draft).toMatchObject({ status: 'draft', publishedAt: '2026-09-07T01:00:00.000Z' });
      await expect(harness.repository.transitionStatus(post.id, 'draft', '2026-09-07T04:00:00.000Z')).resolves.toEqual(draft);
    });

    it('lists only published posts with stable pagination', async () => {
      const older = postFixture({
        id: '00000000-0000-4000-8000-000000000001',
        slug: 'older',
        status: 'published',
        publishedAt: '2026-09-07T01:00:00.000Z',
      });
      const newer = postFixture({
        id: '00000000-0000-4000-8000-000000000002',
        slug: 'newer',
        status: 'published',
        publishedAt: '2026-09-07T02:00:00.000Z',
      });
      await harness.repository.create(older);
      await harness.repository.create(newer);
      await harness.repository.create(postFixture({ id: '00000000-0000-4000-8000-000000000003', slug: 'draft' }));

      const firstPage = await harness.repository.listPublic({ limit: 1, offset: 0 });
      expect(firstPage.total).toBe(2);
      expect(firstPage.items.map((post) => post.slug)).toEqual(['newer']);
      expect(firstPage.items[0]).not.toHaveProperty('bodyMarkdown');
      await expect(harness.repository.listPublic({ limit: 1, offset: 2 })).resolves.toEqual({ items: [], total: 2 });
    });

    it('normalizes duplicate slugs to a domain error', async () => {
      await harness.repository.create(postFixture());
      await expect(
        harness.repository.create(postFixture({ id: '00000000-0000-4000-8000-000000000002' })),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it('replays matching idempotent creates and rejects a changed request', async () => {
      const operation = {
        key: 'create-post-key',
        requestHash: 'a'.repeat(64),
        createdAt: '2026-09-07T00:00:00.000Z',
        expiresAt: '2026-09-08T00:00:00.000Z',
      };
      const first = await harness.repository.createIdempotently(postFixture(), operation);
      const replay = await harness.repository.createIdempotently(
        postFixture({ id: '00000000-0000-4000-8000-000000000009' }),
        { ...operation, createdAt: '2026-09-07T01:00:00.000Z' },
      );

      expect(first.replayed).toBe(false);
      expect(replay).toEqual({ resource: first.resource, replayed: true });
      await expect(
        harness.repository.createIdempotently(postFixture(), {
          ...operation,
          requestHash: 'b'.repeat(64),
          createdAt: '2026-09-07T02:00:00.000Z',
        }),
      ).rejects.toMatchObject({ name: 'IdempotencyConflictError' });
    });
  });
}
