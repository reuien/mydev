import type { D1Database } from '@cloudflare/workers-types';

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

  async createIdempotently(input: NewProject, operation: IdempotencyInput): Promise<IdempotentResult<Project>> {
    try {
      const existing = await this.database
        .prepare(
          `SELECT request_hash, response_body, expires_at FROM idempotency_keys
           WHERE scope = 'create_project' AND key = ?`,
        )
        .bind(operation.key)
        .first<{ request_hash: string; response_body: string; expires_at: string }>();
      if (existing && existing.expires_at > operation.createdAt) {
        if (existing.request_hash !== operation.requestHash) throw new IdempotencyConflictError('Idempotency key conflict');
        return { resource: JSON.parse(existing.response_body) as Project, replayed: true };
      }

      const statements = [];
      if (existing) {
        statements.push(
          this.database.prepare("DELETE FROM idempotency_keys WHERE scope = 'create_project' AND key = ?").bind(operation.key),
        );
      }
      statements.push(
        this.database
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
          ),
        this.database
          .prepare(
            `INSERT INTO idempotency_keys
             (scope, key, request_hash, response_status, response_body, resource_id, created_at, expires_at)
             VALUES ('create_project', ?, ?, 201, ?, ?, ?, ?)`,
          )
          .bind(
            operation.key,
            operation.requestHash,
            JSON.stringify(input),
            input.id,
            operation.createdAt,
            operation.expiresAt,
          ),
      );
      await this.database.batch(statements);
      return { resource: input, replayed: false };
    } catch (error) {
      if (error instanceof IdempotencyConflictError) throw error;
      return translateWriteError(error, input.slug);
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
