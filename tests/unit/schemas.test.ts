import { describe, expect, it } from 'vitest';

import { createPostSchema, updatePostSchema } from '../../src/schemas/post';
import { createProjectSchema, updateProjectSchema } from '../../src/schemas/project';

const validPost = {
  slug: 'first-post',
  title: 'First post',
  excerpt: 'A short introduction.',
  bodyMarkdown: '# Hello',
  coverImageUrl: '/assets/posts/first-post.webp',
};

const validProject = {
  slug: 'my-project',
  name: 'My Project',
  summary: 'A concise summary.',
  bodyMarkdown: '# Project',
  techStack: ['TypeScript', 'Astro'],
  codeUrl: 'https://github.com/example/my-project',
  demoUrl: null,
  coverImageUrl: '/assets/projects/my-project.webp',
  sortOrder: 10,
};

describe('post schemas', () => {
  it('accepts the documented create payload', () => {
    expect(createPostSchema.parse(validPost)).toEqual(validPost);
  });

  it.each(['Uppercase', '-leading', 'trailing-', 'two--hyphens', '中文'])('rejects invalid slug %s', (slug) => {
    expect(createPostSchema.safeParse({ ...validPost, slug }).success).toBe(false);
  });

  it('rejects unknown and server-managed fields', () => {
    expect(createPostSchema.safeParse({ ...validPost, status: 'published' }).success).toBe(false);
  });

  it('enforces title and UTF-8 body byte limits', () => {
    expect(createPostSchema.safeParse({ ...validPost, title: 'x'.repeat(161) }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...validPost, bodyMarkdown: '   ' }).success).toBe(false);
    expect(createPostSchema.safeParse({ ...validPost, bodyMarkdown: '界'.repeat(349_526) }).success).toBe(false);
  });

  it.each(['javascript:alert(1)', 'ftp://example.com/a.png', '/uploads/a.png'])('rejects unsafe cover URL %s', (coverImageUrl) => {
    expect(createPostSchema.safeParse({ ...validPost, coverImageUrl }).success).toBe(false);
  });

  it('forbids slug during a full update and requires nullable cover input', () => {
    const { slug: _slug, ...update } = validPost;
    expect(updatePostSchema.safeParse(update).success).toBe(true);
    expect(updatePostSchema.safeParse(validPost).success).toBe(false);
    expect(updatePostSchema.safeParse({ ...update, coverImageUrl: undefined }).success).toBe(false);
  });
});

describe('project schemas', () => {
  it('defaults sortOrder and normalizes empty optional URLs', () => {
    const result = createProjectSchema.parse({
      ...validProject,
      codeUrl: '',
      demoUrl: '',
      coverImageUrl: '',
      sortOrder: undefined,
    });

    expect(result).toMatchObject({ codeUrl: null, demoUrl: null, coverImageUrl: null, sortOrder: 0 });
  });

  it('requires 1 to 20 unique trimmed technologies', () => {
    expect(createProjectSchema.safeParse({ ...validProject, techStack: [] }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...validProject, techStack: ['Astro', ' Astro '] }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...validProject, techStack: Array.from({ length: 21 }, (_, index) => `T${index}`) }).success).toBe(false);
  });

  it('rejects non-http project links and out-of-range sort orders', () => {
    expect(createProjectSchema.safeParse({ ...validProject, codeUrl: 'git@example.com:repo.git' }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...validProject, sortOrder: 2_147_483_648 }).success).toBe(false);
  });

  it('requires every editable field on update and rejects slug', () => {
    const { slug: _slug, ...update } = validProject;
    expect(updateProjectSchema.safeParse(update).success).toBe(true);
    expect(updateProjectSchema.safeParse(validProject).success).toBe(false);
    const { summary: _summary, ...incomplete } = update;
    expect(updateProjectSchema.safeParse(incomplete).success).toBe(false);
  });
});
