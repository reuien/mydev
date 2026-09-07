import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import matter from 'gray-matter';
import { z } from 'zod';

import { createPostSchema } from '../schemas/post';
import { createProjectSchema } from '../schemas/project';

const baseSchema = z.object({ type: z.enum(['post', 'project']), id: z.uuid().optional() }).loose();
export type ContentDocument =
  | { type: 'post'; id?: string; slug: string; payload: z.infer<typeof createPostSchema> }
  | { type: 'project'; id?: string; slug: string; payload: z.infer<typeof createProjectSchema> };

export async function readContentDocument(file: string): Promise<ContentDocument> {
  const parsed = matter(await readFile(resolve(file), 'utf8'));
  const base = baseSchema.parse(parsed.data);
  const { type: _type, id, ...fields } = parsed.data;
  const candidate = { ...fields, bodyMarkdown: parsed.content };
  if (base.type === 'post') {
    const payload = createPostSchema.parse(candidate);
    return { type: 'post', ...(id ? { id } : {}), slug: payload.slug, payload };
  }
  const payload = createProjectSchema.parse(candidate);
  return { type: 'project', ...(id ? { id } : {}), slug: payload.slug, payload };
}

export async function assertLocalAssetsExist(document: ContentDocument): Promise<void> {
  const url = document.payload.coverImageUrl;
  if (url?.startsWith('/assets/')) await readFile(resolve('public', url.slice(1)));
}
