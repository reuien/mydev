import type { Project } from '../domain/project';
import type {
  ProjectListItem,
  ProjectRepository,
  UpdateProject,
} from '../repositories/project-repository';
import type { CreateProjectInput } from '../schemas/project';
import { defaultServiceDependencies, type ServiceDependencies } from './ports';

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
