export interface Project {
  id: string;
  slug: string;
  name: string;
  summary: string;
  bodyMarkdown: string;
  techStack: string[];
  codeUrl: string | null;
  demoUrl: string | null;
  coverImageUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
