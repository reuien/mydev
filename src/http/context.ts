import type { D1Database } from '@cloudflare/workers-types';

import { PostService } from '../application/post-service';
import { ProjectService } from '../application/project-service';
import { D1PostRepository } from '../repositories/d1/post-repository';
import { D1ProjectRepository } from '../repositories/d1/project-repository';
import type { AuthorRateLimiter } from '../middleware/rate-limit';
import type { AuthorHandlerContext } from './author-handlers';

export function createServices(database: D1Database) {
  return {
    posts: new PostService(new D1PostRepository(database)),
    projects: new ProjectService(new D1ProjectRepository(database)),
  };
}

export function createServicesFromEnvironment(environment: unknown) {
  return createServices((environment as { DB: D1Database }).DB);
}

export function createAuthorContext(environment: unknown, request: Request): AuthorHandlerContext {
  const bindings = environment as {
    DB: D1Database;
    AUTHOR_API_TOKEN: string;
    AUTHOR_RATE_LIMITER?: AuthorRateLimiter;
  };
  return {
    ...createServices(bindings.DB),
    expectedToken: bindings.AUTHOR_API_TOKEN,
    clientKey: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    rateLimiter: bindings.AUTHOR_RATE_LIMITER,
  };
}
