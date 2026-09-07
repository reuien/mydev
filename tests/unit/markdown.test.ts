import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('renders GFM tables and fenced code', async () => {
    const html = await renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1;\n```');

    expect(html).toContain('<table>');
    expect(html).toContain('<code class="language-ts">');
  });

  it('removes raw HTML, event handlers, and javascript URLs', async () => {
    const html = await renderMarkdown(
      '<script>alert(1)</script><img src="x" onerror="alert(1)">\n\n[unsafe](javascript:alert(1))',
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('unsafe');
  });
});
