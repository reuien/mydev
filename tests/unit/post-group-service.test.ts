import { describe, expect, it } from 'vitest';

import { PostGroupService } from '../../src/application/post-group-service';
import type { PostGroup } from '../../src/domain/post-group';
import type { PostGroupRepository } from '../../src/repositories/post-group-repository';

describe('PostGroupService', () => {
  it('creates and lists an author-defined group', async () => {
    const groups: PostGroup[] = [];
    const repository: PostGroupRepository = {
      async create(group) { groups.push(group); return group; },
      async findById(id) { return groups.find((group) => group.id === id) ?? null; },
      async findBySlug(slug) { return groups.find((group) => group.slug === slug) ?? null; },
      async list() { return groups; },
    };
    const service = new PostGroupService(repository, {
      generateId: () => '00000000-0000-4000-8000-000000000099',
      now: () => '2026-09-30T00:00:00.000Z',
    });

    const created = await service.create({
      slug: 'distributed-systems',
      name: '分布式',
      description: '分布式系统课程笔记',
    });

    expect(created.name).toBe('分布式');
    expect(await service.getBySlug('distributed-systems')).toEqual(created);
    expect(await service.list()).toEqual([created]);
  });
});
