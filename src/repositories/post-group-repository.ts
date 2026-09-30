import type { PostGroup } from '../domain/post-group';

export interface PostGroupRepository {
  create(group: PostGroup): Promise<PostGroup>;
  findById(id: string): Promise<PostGroup | null>;
  findBySlug(slug: string): Promise<PostGroup | null>;
  list(): Promise<PostGroup[]>;
}
