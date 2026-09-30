import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export interface MarkdownHeading {
  depth: number;
  id: string;
  text: string;
}

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

function nodeText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return node.children?.map(nodeText).join('') ?? '';
}

function headingId(text: string, index: number, used: Set<string>): string {
  const base = text
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '') || `section-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

function collectHeadings(headings: MarkdownHeading[]) {
  return () => (tree: HastNode) => {
    const used = new Set<string>();
    const walk = (node: HastNode) => {
      const match = node.tagName?.match(/^h([2-5])$/);
      if (match) {
        const text = nodeText(node).trim();
        if (text) {
          const id = headingId(text, headings.length, used);
          node.properties = { ...node.properties, id };
          headings.push({ depth: Number(match[1]), id: `user-content-${id}`, text });
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

export async function renderMarkdownDocument(markdown: string): Promise<{ html: string; headings: MarkdownHeading[] }> {
  const headings: MarkdownHeading[] = [];
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(collectHeadings(headings))
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);
  return { html: String(result), headings };
}

export async function renderMarkdown(markdown: string): Promise<string> {
  return (await renderMarkdownDocument(markdown)).html;
}
