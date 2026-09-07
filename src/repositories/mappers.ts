import type { Post } from '../domain/post';
import type { Project } from '../domain/project';
import type { PostListItem } from './post-repository';
import type { ProjectListItem } from './project-repository';

export type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  body_markdown: string;
  tech_stack_json: string;
  code_url: string | null;
  demo_url: string | null;
  cover_image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const POST_COLUMNS = `id, slug, title, excerpt, body_markdown, cover_image_url,
  status, created_at, updated_at, published_at`;

export const PROJECT_COLUMNS = `id, slug, name, summary, body_markdown, tech_stack_json,
  code_url, demo_url, cover_image_url, sort_order, created_at, updated_at`;

export function toPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    coverImageUrl: row.cover_image_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export function toPostListItem(post: Post): PostListItem {
  const { bodyMarkdown: _bodyMarkdown, status: _status, createdAt: _createdAt, ...item } = post;
  return item;
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    summary: row.summary,
    bodyMarkdown: row.body_markdown,
    techStack: JSON.parse(row.tech_stack_json) as string[],
    codeUrl: row.code_url,
    demoUrl: row.demo_url,
    coverImageUrl: row.cover_image_url,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProjectListItem(project: Project): ProjectListItem {
  const { bodyMarkdown: _bodyMarkdown, ...item } = project;
  return item;
}
