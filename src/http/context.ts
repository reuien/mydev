import type { D1Database } from '@cloudflare/workers-types';

import { PostService } from '../application/post-service';
import { ProjectService } from '../application/project-service';
import { D1PostRepository } from '../repositories/d1/post-repository';
import { D1ProjectRepository } from '../repositories/d1/project-repository';

export function createServices(database: D1Database) {
  return {
    posts: new PostService(new D1PostRepository(database)),
    projects: new ProjectService(new D1ProjectRepository(database)),
  };
}

export function createServicesFromEnvironment(environment: unknown) {
  return createServices((environment as { DB: D1Database }).DB);
}
