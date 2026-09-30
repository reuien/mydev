import { describe, expect, it } from 'vitest';

import { publishPost, type Post, unpublishPost } from '../../src/domain/post';

const draftPost = (): Post => ({
  id: '7b3c82d5-9078-4f5d-8718-59736cbc0d4e',
  slug: 'first-post',
  title: 'First post',
  excerpt: 'A short introduction.',
  bodyMarkdown: '# Hello',
  coverImageUrl: null,
  groupId: null,
  status: 'draft',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  publishedAt: null,
});

describe('post state transitions', () => {
  it('publishes a draft using the injected time', () => {
    const result = publishPost(draftPost(), '2026-09-07T01:00:00.000Z');

    expect(result).toMatchObject({
      status: 'published',
      publishedAt: '2026-09-07T01:00:00.000Z',
      updatedAt: '2026-09-07T01:00:00.000Z',
    });
  });

  it('does not refresh timestamps when publishing an already published post', () => {
    const published = publishPost(draftPost(), '2026-09-07T01:00:00.000Z');

    expect(publishPost(published, '2026-09-07T02:00:00.000Z')).toEqual(published);
  });

  it('unpublishes while retaining the last published time', () => {
    const published = publishPost(draftPost(), '2026-09-07T01:00:00.000Z');
    const result = unpublishPost(published, '2026-09-07T02:00:00.000Z');

    expect(result).toMatchObject({
      status: 'draft',
      publishedAt: '2026-09-07T01:00:00.000Z',
      updatedAt: '2026-09-07T02:00:00.000Z',
    });
  });

  it('does not refresh timestamps when unpublishing a draft', () => {
    const draft = draftPost();

    expect(unpublishPost(draft, '2026-09-07T02:00:00.000Z')).toEqual(draft);
  });
});
