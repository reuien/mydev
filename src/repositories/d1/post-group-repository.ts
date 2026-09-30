import type { D1Database } from '@cloudflare/workers-types';

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

export class D1PostGroupRepository implements PostGroupRepository {
  constructor(private readonly database: D1Database) {}

  async create(group: PostGroup): Promise<PostGroup> {
    try {
      await this.database.prepare(`INSERT INTO post_groups (${columns}) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        group.id, group.slug, group.name, group.description, group.createdAt, group.updatedAt,
      ).run();
      return group;
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: post_groups.slug')) {
        throw new SlugConflictError(`Post group slug already exists: ${group.slug}`);
      }
      throw new StorageUnavailableError('D1 post group operation failed', { cause: error });
    }
  }

  async findById(id: string): Promise<PostGroup | null> { return this.find('id', id); }
  async findBySlug(slug: string): Promise<PostGroup | null> { return this.find('slug', slug); }

  async list(): Promise<PostGroup[]> {
    try {
      const rows = await this.database.prepare(`SELECT ${columns} FROM post_groups ORDER BY name, id`).all<Row>();
      return rows.results.map(map);
    } catch (error) {
      throw new StorageUnavailableError('D1 post group listing failed', { cause: error });
    }
  }

  private async find(field: 'id' | 'slug', value: string): Promise<PostGroup | null> {
    try {
      const row = await this.database.prepare(`SELECT ${columns} FROM post_groups WHERE ${field} = ?`).bind(value).first<Row>();
      return row ? map(row) : null;
    } catch (error) {
      throw new StorageUnavailableError('D1 post group lookup failed', { cause: error });
    }
  }
}
