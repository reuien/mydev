import type { Post, PostStatus } from '../domain/post';

export type NewPost = Post;
export type UpdatePost = Pick<Post, 'title' | 'excerpt' | 'bodyMarkdown' | 'coverImageUrl'>;
export type PostListItem = Omit<Post, 'bodyMarkdown' | 'status' | 'createdAt'>;
export type PageRequest = { limit: number; offset: number };
export type PageResult<T> = { items: T[]; total: number };

export interface PostRepository {
  create(input: NewPost): Promise<Post>;
  findAuthorById(id: string): Promise<Post | null>;
  findAuthorBySlug(slug: string): Promise<Post | null>;
  findPublicBySlug(slug: string): Promise<Post | null>;
  listPublic(page: PageRequest): Promise<PageResult<PostListItem>>;
  updateContent(id: string, input: UpdatePost, now: string): Promise<Post | null>;
  transitionStatus(id: string, target: PostStatus, now: string): Promise<Post | null>;
  delete(id: string): Promise<boolean>;
}
