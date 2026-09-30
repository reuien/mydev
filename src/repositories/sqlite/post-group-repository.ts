import type { DatabaseSync } from 'node:sqlite';

import { SlugConflictError, StorageUnavailableError } from '../../domain/errors';
import type { PostGroup } from '../../domain/post-group';
import type { PostGroupRepository } from '../post-group-repository';

type Row = { id: string; slug: string; name: string; description: string; created_at: string; updated_at: string };
const columns = 'id, slug, name, description, created_at, updated_at';
const map = (row: Row): PostGroup => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqlitePostGroupRepository implements PostGroupRepository {
  constructor(private readonly database: DatabaseSync) {}

  async create(group: PostGroup): Promise<PostGroup> {
    try {
      this.database.prepare(`INSERT INTO post_groups (${columns}) VALUES (?, ?, ?, ?, ?, ?)`).run(
        group.id, group.slug, group.name, group.description, group.createdAt, group.updatedAt,
      );
      return group;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: post_groups.slug')) {
        throw new SlugConflictError(`Post group slug already exists: ${group.slug}`);
      }
      throw new StorageUnavailableError('SQLite post group operation failed', { cause: error });
    }
  }

  async findById(id: string): Promise<PostGroup | null> { return this.find('id', id); }
  async findBySlug(slug: string): Promise<PostGroup | null> { return this.find('slug', slug); }

  async list(): Promise<PostGroup[]> {
    try {
      return (this.database.prepare(`SELECT ${columns} FROM post_groups ORDER BY name, id`).all() as Row[]).map(map);
    } catch (error) {
      throw new StorageUnavailableError('SQLite post group listing failed', { cause: error });
    }
  }

  private find(field: 'id' | 'slug', value: string): PostGroup | null {
    try {
      const row = this.database.prepare(`SELECT ${columns} FROM post_groups WHERE ${field} = ?`).get(value) as Row | undefined;
      return row ? map(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('SQLite post group lookup failed', { cause: error });
    }
  }
}
