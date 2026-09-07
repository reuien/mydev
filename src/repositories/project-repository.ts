import type { Project } from '../domain/project';

export type NewProject = Project;
export type UpdateProject = Pick<
  Project,
  'name' | 'summary' | 'bodyMarkdown' | 'techStack' | 'codeUrl' | 'demoUrl' | 'coverImageUrl' | 'sortOrder'
>;
export type ProjectListItem = Omit<Project, 'bodyMarkdown'>;

export interface ProjectRepository {
  create(input: NewProject): Promise<Project>;
  findAuthorById(id: string): Promise<Project | null>;
  findAuthorBySlug(slug: string): Promise<Project | null>;
  findPublicBySlug(slug: string): Promise<Project | null>;
  listPublic(): Promise<ProjectListItem[]>;
  update(id: string, input: UpdateProject, now: string): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}
