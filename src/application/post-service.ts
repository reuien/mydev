import type { Post, PostStatus } from '../domain/post';
import type {
  PageRequest,
  PageResult,
  PostListItem,
  PostRepository,
  UpdatePost,
} from '../repositories/post-repository';
import type { CreatePostInput } from '../schemas/post';
import { defaultServiceDependencies, type ServiceDependencies } from './ports';
import { createIdempotencyOperation } from './idempotency-service';

export class PostService {
  constructor(
    private readonly repository: PostRepository,
    private readonly dependencies: ServiceDependencies = defaultServiceDependencies,
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

  update(id: string, input: UpdatePost): Promise<Post | null> {
    return this.repository.updateContent(id, input, this.dependencies.now());
  }

  publish(id: string): Promise<Post | null> {
    return this.transition(id, 'published');
  }

  unpublish(id: string): Promise<Post | null> {
    return this.transition(id, 'draft');
  }

  delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  private transition(id: string, target: PostStatus): Promise<Post | null> {
    return this.repository.transitionStatus(id, target, this.dependencies.now());
  }
}
