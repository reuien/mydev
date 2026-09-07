import { describe, expect, it, vi } from 'vitest';

import { ProjectService } from '../../src/application/project-service';
import type { ProjectRepository } from '../../src/repositories/project-repository';

describe('ProjectService', () => {
  it('creates an immediately public project with injected identity and time', async () => {
    const repository: ProjectRepository = {
      create: vi.fn().mockImplementation(async (project) => project),
      findAuthorById: vi.fn(),
      findAuthorBySlug: vi.fn(),
      findPublicBySlug: vi.fn(),
      listPublic: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createIdempotently: vi.fn(),
    };
    const service = new ProjectService(repository, {
      now: () => '2026-09-07T00:00:00.000Z',
      generateId: () => '10000000-0000-4000-8000-000000000009',
    });

    const project = await service.create({
      slug: 'new-project',
      name: 'New project',
      summary: 'Summary',
      bodyMarkdown: '# Project',
      techStack: ['Astro'],
      codeUrl: null,
      demoUrl: null,
      coverImageUrl: null,
      sortOrder: 0,
    });

    expect(project).toMatchObject({
      id: '10000000-0000-4000-8000-000000000009',
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });
  });
});
