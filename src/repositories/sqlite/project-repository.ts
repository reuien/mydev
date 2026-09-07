import type { DatabaseSync } from 'node:sqlite';

import { SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Project } from '../../domain/project';
import type {
  NewProject,
  ProjectListItem,
  ProjectRepository,
  UpdateProject,
} from '../project-repository';

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  body_markdown: string;
  tech_stack_json: string;
  code_url: string | null;
  demo_url: string | null;
  cover_image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const PROJECT_COLUMNS = `id, slug, name, summary, body_markdown, tech_stack_json,
  code_url, demo_url, cover_image_url, sort_order, created_at, updated_at`;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    techStack: JSON.parse(row.tech_stack_json) as string[],
    codeUrl: row.code_url,
    demoUrl: row.demo_url,
    coverImageUrl: row.cover_image_url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toListItem(project: Project): ProjectListItem {
  const { bodyMarkdown: _bodyMarkdown, ...item } = project;
  return item;
}

function translateWriteError(error: unknown, slug: string): never {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: projects.slug')) {
    throw new SlugConflictError(`Project slug already exists: ${slug}`);
  }
  throw new StorageUnavailableError('SQLite project operation failed', { cause: error });
}

export class SqliteProjectRepository implements ProjectRepository {
  constructor(private readonly database: DatabaseSync) {}

  async create(input: NewProject): Promise<Project> {
    try {
      this.database
        .prepare(`INSERT INTO projects (${PROJECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          input.id,
          input.slug,
          input.name,
          input.summary,
          input.bodyMarkdown,
          JSON.stringify(input.techStack),
          input.codeUrl,
          input.demoUrl,
          input.coverImageUrl,
          input.sortOrder,
          input.createdAt,
          input.updatedAt,
        );
      return input;
    } catch (error) {
      return translateWriteError(error, input.slug);
    }
  }

  async findAuthorById(id: string): Promise<Project | null> {
    return this.findOne(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`, id);
  }

  async findAuthorBySlug(slug: string): Promise<Project | null> {
    return this.findOne(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE slug = ?`, slug);
  }

  async findPublicBySlug(slug: string): Promise<Project | null> {
    return this.findAuthorBySlug(slug);
  }

  async listPublic(): Promise<ProjectListItem[]> {
    try {
      const rows = this.database
        .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY sort_order DESC, created_at DESC, id DESC`)
        .all() as ProjectRow[];
      return rows.map(toProject).map(toListItem);
    } catch (error) {
      throw new StorageUnavailableError('SQLite project listing failed', { cause: error });
    }
  }

  async update(id: string, input: UpdateProject, now: string): Promise<Project | null> {
    try {
      const result = this.database
        .prepare(
          `UPDATE projects SET name = ?, summary = ?, body_markdown = ?, tech_stack_json = ?,
           code_url = ?, demo_url = ?, cover_image_url = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          input.name,
          input.summary,
          input.bodyMarkdown,
          JSON.stringify(input.techStack),
          input.codeUrl,
          input.demoUrl,
          input.coverImageUrl,
          input.sortOrder,
          now,
          id,
        );
      return result.changes === 0 ? null : this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('SQLite project update failed', { cause: error });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      return this.database.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
    } catch (error) {
      throw new StorageUnavailableError('SQLite project delete failed', { cause: error });
    }
  }

  private findOne(sql: string, value: string): Project | null {
    try {
      const row = this.database.prepare(sql).get(value) as ProjectRow | undefined;
      return row ? toProject(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('SQLite project lookup failed', { cause: error });
    }
  }
}
