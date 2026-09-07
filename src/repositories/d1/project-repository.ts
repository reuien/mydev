import type { D1Database } from '@cloudflare/workers-types';

import { SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Project } from '../../domain/project';
import { PROJECT_COLUMNS, type ProjectRow, toProject, toProjectListItem } from '../mappers';
import type {
  NewProject,
  ProjectListItem,
  ProjectRepository,
  UpdateProject,
} from '../project-repository';

function translateWriteError(error: unknown, slug: string): never {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: projects.slug')) {
    throw new SlugConflictError(`Project slug already exists: ${slug}`);
  }
  throw new StorageUnavailableError('D1 project operation failed', { cause: error });
}

export class D1ProjectRepository implements ProjectRepository {
  constructor(private readonly database: D1Database) {}

  async create(input: NewProject): Promise<Project> {
    try {
      await this.database
        .prepare(`INSERT INTO projects (${PROJECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
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
        )
        .run();
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
      const rows = await this.database
        .prepare(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY sort_order DESC, created_at DESC, id DESC`)
        .all<ProjectRow>();
      return rows.results.map(toProject).map(toProjectListItem);
    } catch (error) {
      throw new StorageUnavailableError('D1 project listing failed', { cause: error });
    }
  }

  async update(id: string, input: UpdateProject, now: string): Promise<Project | null> {
    try {
      const result = await this.database
        .prepare(
          `UPDATE projects SET name = ?, summary = ?, body_markdown = ?, tech_stack_json = ?,
           code_url = ?, demo_url = ?, cover_image_url = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(
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
        )
        .run();
      return result.meta.changes === 0 ? null : this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('D1 project update failed', { cause: error });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.database.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
      return result.meta.changes > 0;
    } catch (error) {
      throw new StorageUnavailableError('D1 project delete failed', { cause: error });
    }
  }

  private async findOne(sql: string, value: string): Promise<Project | null> {
    try {
      const row = await this.database.prepare(sql).bind(value).first<ProjectRow>();
      return row ? toProject(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('D1 project lookup failed', { cause: error });
    }
  }
}
