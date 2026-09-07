import type { Post } from '../../src/domain/post';

export function postFixture(overrides: Partial<Post> = {}): Post {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'first-post',
    title: 'First post',
    excerpt: 'A short introduction.',
    bodyMarkdown: '# Hello',
    coverImageUrl: null,
    status: 'draft',
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    publishedAt: null,
    ...overrides,
  };
}
