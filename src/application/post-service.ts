import type { Post, PostStatus } from '../domain/post';
import type {
  PageRequest,
  PageResult,
  PostListItem,
  PostRepository,
  UpdatePost,
} from '../repositories/post-repository';
import type { CreatePostInput } from '../schemas/post';
import type { PostQueryInvalidator } from '../services/post-query';
import { defaultServiceDependencies, type ServiceDependencies } from './ports';
import { createIdempotencyOperation } from './idempotency-service';

const noCacheInvalidation: PostQueryInvalidator = { invalidate: async () => undefined };

export class PostService {
  constructor(
    private readonly repository: PostRepository,
    private readonly dependencies: ServiceDependencies = defaultServiceDependencies,
    private readonly queryCache: PostQueryInvalidator = noCacheInvalidation,
  ) {}

  async create(input: CreatePostInput): Promise<Post> {
    const now = this.dependencies.now();
    return this.repository.create({
      ...input,
      id: this.dependencies.generateId(),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    });
  }

  async createIdempotently(input: CreatePostInput, key: string) {
    const now = this.dependencies.now();
    const resource: Post = {
      ...input,
      id: this.dependencies.generateId(),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };
    return this.repository.createIdempotently(resource, await createIdempotencyOperation(key, input, now));
  }

  getAuthorById(id: string): Promise<Post | null> {
    return this.repository.findAuthorById(id);
  }

  getAuthorBySlug(slug: string): Promise<Post | null> {
    return this.repository.findAuthorBySlug(slug);
  }

  getPublicBySlug(slug: string): Promise<Post | null> {
    return this.repository.findPublicBySlug(slug);
  }

  listPublic(page: PageRequest): Promise<PageResult<PostListItem>> {
    return this.repository.listPublic(page);
  }

  async update(id: string, input: UpdatePost): Promise<Post | null> {
    const post = await this.repository.updateContent(id, input, this.dependencies.now());
    if (post) await this.invalidateQueries();
    return post;
  }

  publish(id: string): Promise<Post | null> {
    return this.transition(id, 'published');
  }

  unpublish(id: string): Promise<Post | null> {
    return this.transition(id, 'draft');
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.repository.delete(id);
    if (deleted) await this.invalidateQueries();
    return deleted;
  }

  private async transition(id: string, target: PostStatus): Promise<Post | null> {
    const post = await this.repository.transitionStatus(id, target, this.dependencies.now());
    if (post) await this.invalidateQueries();
    return post;
  }

  private async invalidateQueries(): Promise<void> {
    try {
      await this.queryCache.invalidate();
    } catch {
      // Content writes remain successful if the optional edge cache is unavailable.
    }
  }
}
