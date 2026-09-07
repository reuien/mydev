import type { Project } from '../domain/project';
import type {
  ProjectListItem,
  ProjectRepository,
  UpdateProject,
} from '../repositories/project-repository';
import type { CreateProjectInput } from '../schemas/project';
import { defaultServiceDependencies, type ServiceDependencies } from './ports';
import { createIdempotencyOperation } from './idempotency-service';

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly dependencies: ServiceDependencies = defaultServiceDependencies,
  ) {}

  async create(input: CreateProjectInput): Promise<Project> {
    const now = this.dependencies.now();
    return this.repository.create({
      ...input,
      id: this.dependencies.generateId(),
      createdAt: now,
      updatedAt: now,
    });
  }

  async createIdempotently(input: CreateProjectInput, key: string) {
    const now = this.dependencies.now();
    const resource: Project = {
      ...input,
      id: this.dependencies.generateId(),
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.createIdempotently(resource, await createIdempotencyOperation(key, input, now));
  }

  getAuthorById(id: string): Promise<Project | null> {
    return this.repository.findAuthorById(id);
  }

  getAuthorBySlug(slug: string): Promise<Project | null> {
    return this.repository.findAuthorBySlug(slug);
  }

  getPublicBySlug(slug: string): Promise<Project | null> {
    return this.repository.findPublicBySlug(slug);
  }

  listPublic(): Promise<ProjectListItem[]> {
    return this.repository.listPublic();
  }

  update(id: string, input: UpdateProject): Promise<Project | null> {
    return this.repository.update(id, input, this.dependencies.now());
  }

  delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }
}
