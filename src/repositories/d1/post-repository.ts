import type { D1Database } from '@cloudflare/workers-types';

import { SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Post } from '../../domain/post';
import { POST_COLUMNS, type PostRow, toPost, toPostListItem } from '../mappers';
import type {
  NewPost,
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
  throw new StorageUnavailableError('D1 post operation failed', { cause: error });
}

export class D1PostRepository implements PostRepository {
  constructor(private readonly database: D1Database) {}

  async create(input: NewPost): Promise<Post> {
    try {
      await this.database
        .prepare(`INSERT INTO posts (${POST_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
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
        )
        .run();
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
      const [rows, count] = await Promise.all([
        this.database
          .prepare(
            `SELECT ${POST_COLUMNS} FROM posts WHERE status = 'published'
             ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`,
          )
          .bind(page.limit, page.offset)
          .all<PostRow>(),
        this.database.prepare("SELECT COUNT(*) AS total FROM posts WHERE status = 'published'").first<{ total: number }>(),
      ]);
      return { items: rows.results.map(toPost).map(toPostListItem), total: Number(count?.total ?? 0) };
    } catch (error) {
      throw new StorageUnavailableError('D1 post listing failed', { cause: error });
    }
  }

  async updateContent(id: string, input: UpdatePost, now: string): Promise<Post | null> {
    try {
      const result = await this.database
        .prepare(
          `UPDATE posts SET title = ?, excerpt = ?, body_markdown = ?, cover_image_url = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(input.title, input.excerpt, input.bodyMarkdown, input.coverImageUrl, now, id)
        .run();
      return result.meta.changes === 0 ? null : this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('D1 post update failed', { cause: error });
    }
  }

  async transitionStatus(id: string, target: Post['status'], now: string): Promise<Post | null> {
    try {
      if (target === 'published') {
        await this.database
          .prepare(
            `UPDATE posts SET status = 'published', published_at = ?, updated_at = ?
             WHERE id = ? AND status = 'draft'`,
          )
          .bind(now, now, id)
          .run();
      } else {
        await this.database
          .prepare("UPDATE posts SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'published'")
          .bind(now, id)
          .run();
      }
      return this.findAuthorById(id);
    } catch (error) {
      throw new StorageUnavailableError('D1 post transition failed', { cause: error });
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.database.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
      return result.meta.changes > 0;
    } catch (error) {
      throw new StorageUnavailableError('D1 post delete failed', { cause: error });
    }
  }

  private async findOne(sql: string, value: string): Promise<Post | null> {
    try {
      const row = await this.database.prepare(sql).bind(value).first<PostRow>();
      return row ? toPost(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('D1 post lookup failed', { cause: error });
    }
  }
}
