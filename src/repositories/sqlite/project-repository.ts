import type { DatabaseSync } from 'node:sqlite';

import { IdempotencyConflictError, SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Project } from '../../domain/project';
import { PROJECT_COLUMNS, type ProjectRow, toProject, toProjectListItem } from '../mappers';
import type {
  NewProject,
  ProjectListItem,
  ProjectRepository,
  UpdateProject,
} from '../project-repository';
import type { IdempotencyInput, IdempotentResult } from '../post-repository';

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
      return rows.map(toProject).map(toProjectListItem);
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

  async createIdempotently(input: NewProject, operation: IdempotencyInput): Promise<IdempotentResult<Project>> {
    try {
      const existing = this.database
        .prepare(
          `SELECT request_hash, response_body, expires_at FROM idempotency_keys
           WHERE scope = 'create_project' AND key = ?`,
        )
        .get(operation.key) as { request_hash: string; response_body: string; expires_at: string } | undefined;
      if (existing && existing.expires_at > operation.createdAt) {
        if (existing.request_hash !== operation.requestHash) throw new IdempotencyConflictError('Idempotency key conflict');
        return { resource: JSON.parse(existing.response_body) as Project, replayed: true };
      }

      this.database.exec('BEGIN IMMEDIATE');
      if (existing) {
        this.database
          .prepare("DELETE FROM idempotency_keys WHERE scope = 'create_project' AND key = ?")
          .run(operation.key);
      }
      const resource = await this.create(input);
      this.database
        .prepare(
          `INSERT INTO idempotency_keys
           (scope, key, request_hash, response_status, response_body, resource_id, created_at, expires_at)
           VALUES ('create_project', ?, ?, 201, ?, ?, ?, ?)`,
        )
        .run(
          operation.key,
          operation.requestHash,
          JSON.stringify(resource),
          resource.id,
          operation.createdAt,
          operation.expiresAt,
        );
      this.database.exec('COMMIT');
      return { resource, replayed: false };
    } catch (error) {
      try {
        this.database.exec('ROLLBACK');
      } catch {}
      if (error instanceof IdempotencyConflictError || error instanceof SlugConflictError) throw error;
      throw new StorageUnavailableError('SQLite idempotent project create failed', { cause: error });
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
