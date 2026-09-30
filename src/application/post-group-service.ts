import type { PostGroup } from '../domain/post-group';
import type { PostGroupRepository } from '../repositories/post-group-repository';
import type { CreatePostGroupInput } from '../schemas/post-group';
import { defaultServiceDependencies, type ServiceDependencies } from './ports';

export class PostGroupService {
  constructor(
    private readonly repository: PostGroupRepository,
    private readonly dependencies: ServiceDependencies = defaultServiceDependencies,
  ) {}

  create(input: CreatePostGroupInput): Promise<PostGroup> {
    const now = this.dependencies.now();
    return this.repository.create({
      ...input,
      id: this.dependencies.generateId(),
      createdAt: now,
      updatedAt: now,
    });
  }

  getById(id: string): Promise<PostGroup | null> {
    return this.repository.findById(id);
  }

  getBySlug(slug: string): Promise<PostGroup | null> {
    return this.repository.findBySlug(slug);
  }

  list(): Promise<PostGroup[]> {
    return this.repository.list();
  }
}
