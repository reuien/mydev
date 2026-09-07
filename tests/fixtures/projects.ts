import type { Project } from '../../src/domain/project';

export function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'first-project',
    name: 'First project',
    summary: 'A short project summary.',
    bodyMarkdown: '# Project',
    techStack: ['TypeScript', 'Astro'],
    codeUrl: 'https://github.com/example/first-project',
    demoUrl: null,
    coverImageUrl: null,
    sortOrder: 0,
    createdAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
    ...overrides,
  };
}
