export type PostStatus = 'draft' | 'published';

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown: string;
  coverImageUrl: string | null;
  groupId: string | null;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export function publishPost(post: Post, now: string): Post {
  if (post.status === 'published') return post;

  return {
    ...post,
    status: 'published',
    publishedAt: now,
    updatedAt: now,
  };
}

export function unpublishPost(post: Post, now: string): Post {
  if (post.status === 'draft') return post;

  return {
    ...post,
    status: 'draft',
    updatedAt: now,
  };
}
