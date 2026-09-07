import type { PostService } from '../../src/application/post-service';
import type { ProjectService } from '../../src/application/project-service';
import {
  handlePublicPostDetail,
  handlePublicPostList,
  handlePublicProjectDetail,
  handlePublicProjectList,
} from '../../src/http/public-handlers';

export function createTestApp(services: { posts: PostService; projects: ProjectService }) {
  return {
    fetch(request: Request): Promise<Response> {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/api/public/posts') return handlePublicPostList(request, services.posts);
      if (pathname === '/api/public/projects') return handlePublicProjectList(request, services.projects);
      if (pathname.startsWith('/api/public/posts/')) {
        return handlePublicPostDetail(request, services.posts, decodeURIComponent(pathname.slice(18)));
      }
      if (pathname.startsWith('/api/public/projects/')) {
        return handlePublicProjectDetail(request, services.projects, decodeURIComponent(pathname.slice(21)));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    },
  };
}
