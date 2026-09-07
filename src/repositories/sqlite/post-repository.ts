import type { DatabaseSync } from 'node:sqlite';

import { SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { Post } from '../../domain/post';
import type {
  NewPost,
  PageRequest,
  PageResult,
  PostListItem,
  PostRepository,
  UpdatePost,
} from '../post-repository';

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const POST_COLUMNS = `id, slug, title, excerpt, body_markdown, cover_image_url,
  status, created_at, updated_at, published_at`;

function toPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function toListItem(post: Post): PostListItem {
  const { bodyMarkdown: _bodyMarkdown, status: _status, createdAt: _createdAt, ...item } = post;
  return item;
}

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
      return { items: rows.map(toPost).map(toListItem), total: Number(count.total) };
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

  private findOne(sql: string, value: string): Post | null {
    try {
      const row = this.database.prepare(sql).get(value) as PostRow | undefined;
      return row ? toPost(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('SQLite post lookup failed', { cause: error });
    }
  }
}
