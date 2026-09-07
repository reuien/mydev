import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SlugConflictError } from '../../src/domain/errors';
import type { ProjectRepository } from '../../src/repositories/project-repository';
import { projectFixture } from '../fixtures/projects';

type Harness = { repository: ProjectRepository; cleanup: () => void | Promise<void> };

export function runProjectRepositoryContract(name: string, createHarness: () => Harness | Promise<Harness>): void {
  describe(`${name} ProjectRepository contract`, () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = await createHarness();
    });

    afterEach(async () => {
      await harness?.cleanup();
    });

    it('creates, maps, updates, and deletes a project', async () => {
      const project = projectFixture();
      await harness.repository.create(project);
      await expect(harness.repository.findAuthorById(project.id)).resolves.toEqual(project);
      await expect(harness.repository.findAuthorBySlug(project.slug)).resolves.toEqual(project);
      await expect(harness.repository.findPublicBySlug(project.slug)).resolves.toEqual(project);

      const updated = await harness.repository.update(
        project.id,
        { ...project, name: 'Updated project', techStack: ['Astro', 'Cloudflare'] },
        '2026-09-07T01:00:00.000Z',
      );
      expect(updated).toMatchObject({
        name: 'Updated project',
        techStack: ['Astro', 'Cloudflare'],
        updatedAt: '2026-09-07T01:00:00.000Z',
      });
      await expect(harness.repository.delete(project.id)).resolves.toBe(true);
      await expect(harness.repository.findAuthorById(project.id)).resolves.toBeNull();
    });

    it('lists projects by sort order, creation time, then id', async () => {
      await harness.repository.create(projectFixture({ id: '10000000-0000-4000-8000-000000000001', slug: 'low' }));
      await harness.repository.create(
        projectFixture({ id: '10000000-0000-4000-8000-000000000002', slug: 'high-a', sortOrder: 10 }),
      );
      await harness.repository.create(
        projectFixture({ id: '10000000-0000-4000-8000-000000000003', slug: 'high-b', sortOrder: 10 }),
      );

      const projects = await harness.repository.listPublic();
      expect(projects.map((project) => project.slug)).toEqual(['high-b', 'high-a', 'low']);
      expect(projects[0]).not.toHaveProperty('bodyMarkdown');
    });

    it('normalizes duplicate slugs to a domain error', async () => {
      await harness.repository.create(projectFixture());
      await expect(
        harness.repository.create(projectFixture({ id: '10000000-0000-4000-8000-000000000002' })),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });
  });
}
