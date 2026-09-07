import { describe, expect, it, vi } from 'vitest';

import { AuthorApiClient } from '../../src/cli/client';
import { parseCommand } from '../../src/cli/commands';
import { readContentDocument } from '../../src/cli/frontmatter';

describe('publishing CLI', () => {
  it('defaults to local and requires an explicit supported environment', () => {
    expect(parseCommand(['create', 'post.md'])).toMatchObject({ environment: 'local' });
    expect(parseCommand(['create', 'post.md', '--env', 'production'])).toMatchObject({ environment: 'production' });
    expect(() => parseCommand(['create', 'post.md', '--env', 'staging'])).toThrow();
  });

  it('parses and validates post and project frontmatter', async () => {
    await expect(readContentDocument('tests/fixtures/markdown/draft-post.md')).resolves.toMatchObject({
      type: 'post', slug: 'draft-post', payload: { bodyMarkdown: '# Draft post\n' },
    });
    await expect(readContentDocument('tests/fixtures/markdown/project.md')).resolves.toMatchObject({
      type: 'project', slug: 'sample-project', payload: { techStack: ['TypeScript', 'Astro'] },
    });
  });

  it('adds authorization and retries 429 responses at most twice', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const client = new AuthorApiClient('https://example.com', 'secret-token', fetcher);

    const response = await client.request('/api/author/posts');
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });
});
