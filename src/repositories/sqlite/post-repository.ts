import type { DatabaseSync } from 'node:sqlite';

import { IdempotencyConflictError, SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Post } from '../../domain/post';
import { POST_COLUMNS, type PostRow, toPost, toPostListItem } from '../mappers';
import type {
  NewPost,
  IdempotencyInput,
  IdempotentResult,
  PageRequest,
  PageResult,
  PostListItem,
  PostRepository,
  UpdatePost,
} from '../post-repository';

function translateWriteError(error: unknown, slug: string): never {
  if (error instanceof Error && error.message.includes('UNIQUE constraint failed: posts.slug')) {
    throw new SlugConflictError(`Post slug already exists: ${slug}`);
  }
  throw new StorageUnavailableError('SQLite post operation failed', { cause: error });
}

export class SqlitePostRepository implements PostRepository {
  constructor(private readonly database: DatabaseSync) {}

  async create(input: NewPost): Promise<Post> {
    try {
      this.database
        .prepare(`INSERT INTO posts (${POST_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          input.id,
          input.slug,
          input.title,
          input.excerpt,
          input.bodyMarkdown,
          input.coverImageUrl,
          input.status,
          input.createdAt,
          input.updatedAt,
          input.publishedAt,
        );
      return input;
    } catch (error) {
      return translateWriteError(error, input.slug);
    }
  }

  async findAuthorById(id: string): Promise<Post | null> {
    return this.findOne(`SELECT ${POST_COLUMNS} FROM posts WHERE id = ?`, id);
  }

  async findAuthorBySlug(slug: string): Promise<Post | null> {
    return this.findOne(`SELECT ${POST_COLUMNS} FROM posts WHERE slug = ?`, slug);
  }

  async findPublicBySlug(slug: string): Promise<Post | null> {
    return this.findOne(`SELECT ${POST_COLUMNS} FROM posts WHERE slug = ? AND status = 'published'`, slug);
  }

  async listPublic(page: PageRequest): Promise<PageResult<PostListItem>> {
    try {
      const rows = this.database
        .prepare(
          `SELECT ${POST_COLUMNS} FROM posts WHERE status = 'published'
           ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .all(page.limit, page.offset) as PostRow[];
      const count = this.database.prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'published'").get() as {
        total: number;
      };
      return { items: rows.map(toPost).map(toPostListItem), total: Number(count.total) };
    } catch (error) {
      throw new StorageUnavailableError('SQLite post listing failed', { cause: error });
    }
  }

  async updateContent(id: string, input: UpdatePost, now: string): Promise<Post | null> {
    try {
      const result = this.database
        .prepare(
          `UPDATE posts SET title = ?, excerpt = ?, body_markdown = ?, cover_image_url = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(input.title, input.excerpt, input.bodyMarkdown, input.coverImageUrl, now, id);
      return result.changes === 0 ? null : this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('SQLite post update failed', { cause: error });
    }
  }

  async transitionStatus(id: string, target: Post['status'], now: string): Promise<Post | null> {
    try {
      if (target === 'published') {
        this.database
          .prepare(
            `UPDATE posts SET status = 'published', published_at = ?, updated_at = ?
             WHERE id = ? AND status = 'draft'`,
          )
          .run(now, now, id);
      } else {
        this.database
          .prepare("UPDATE posts SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'published'")
          .run(now, id);
      }
      return this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('SQLite post transition failed', { cause: error });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      return this.database.prepare('DELETE FROM posts WHERE id = ?').run(id).changes > 0;
    } catch (error) {
      throw new StorageUnavailableError('SQLite post delete failed', { cause: error });
    }
  }

  async createIdempotently(input: NewPost, operation: IdempotencyInput): Promise<IdempotentResult<Post>> {
    try {
      const existing = this.database
        .prepare(
          `SELECT request_hash, response_body, expires_at FROM idempotency_keys
           WHERE scope = 'create_post' AND key = ?`,
        )
        .get(operation.key) as { request_hash: string; response_body: string; expires_at: string } | undefined;
      if (existing && existing.expires_at > operation.createdAt) {
        if (existing.request_hash !== operation.requestHash) throw new IdempotencyConflictError('Idempotency key conflict');
        return { resource: JSON.parse(existing.response_body) as Post, replayed: true };
      }

      this.database.exec('BEGIN IMMEDIATE');
      if (existing) {
        this.database
          .prepare("DELETE FROM idempotency_keys WHERE scope = 'create_post' AND key = ?")
          .run(operation.key);
      }
      const resource = await this.create(input);
      this.database
        .prepare(
          `INSERT INTO idempotency_keys
           (scope, key, request_hash, response_status, response_body, resource_id, created_at, expires_at)
           VALUES ('create_post', ?, ?, 201, ?, ?, ?, ?)`,
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
      throw new StorageUnavailableError('SQLite idempotent post create failed', { cause: error });
    }
  }

  private findOne(sql: string, value: string): Post | null {
    try {
      const row = this.database.prepare(sql).get(value) as PostRow | undefined;
      return row ? toPost(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('SQLite post lookup failed', { cause: error });
    }
  }
}
