import { describe, expect, it } from 'vitest';

import { renderMarkdown, renderMarkdownDocument } from '../../src/lib/markdown';

describe('renderMarkdown', () => {
  it('renders GFM tables and fenced code', async () => {
    const html = await renderMarkdown('| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst value = 1;\n```');

    expect(html).toContain('<table>');
    expect(html).toContain('<code class="language-ts">');
  });

  it('extracts a stable chapter outline and keeps Mermaid code identifiable', async () => {
    const document = await renderMarkdownDocument('## 错误处理\n\n### Fail Stop\n\n## 错误处理\n\n```mermaid\nflowchart LR\nA --> B\n```');

    expect(document.headings).toEqual([
      { depth: 2, id: 'user-content-错误处理', text: '错误处理' },
      { depth: 3, id: 'user-content-fail-stop', text: 'Fail Stop' },
      { depth: 2, id: 'user-content-错误处理-2', text: '错误处理' },
    ]);
    expect(document.html).toContain('<h2 id="user-content-错误处理">');
    expect(document.html).toContain('<code class="language-mermaid">');
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
