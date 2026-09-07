import { ZodError, type ZodType } from 'zod';

import type { PostService } from '../application/post-service';
import type { ProjectService } from '../application/project-service';
import {
  IdempotencyConflictError,
  SlugConflictError,
  StorageUnavailableError,
} from '../domain/errors';
import { verifyAuthorAuthorization } from '../middleware/author-auth';
import type { AuthorRateLimiter } from '../middleware/rate-limit';
import { allowAllRateLimiter } from '../middleware/rate-limit';
import { requestIdFor } from '../middleware/request-id';
import { createPostSchema, updatePostSchema } from '../schemas/post';
import { createProjectSchema, updateProjectSchema } from '../schemas/project';
import { authorSuccessResponse, errorResponse, noContentResponse } from './response';

const MAX_REQUEST_BYTES = Math.floor(1.1 * 1024 * 1024);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/;

export interface AuthorHandlerContext {
  posts: PostService;
  projects: ProjectService;
  expectedToken: string;
  clientKey?: string;
  rateLimiter?: AuthorRateLimiter;
}

async function parseJson<T>(request: Request, schema: ZodType<T>, requestId: string): Promise<T | Response> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', '请求必须使用 application/json', requestId);
  }
  const declaredLength = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredLength > MAX_REQUEST_BYTES) return errorResponse(413, 'PAYLOAD_TOO_LARGE', '请求内容过大', requestId);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(413, 'PAYLOAD_TOO_LARGE', '请求内容过大', requestId);
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse(400, 'INVALID_JSON', 'JSON 格式不正确', requestId);
    if (error instanceof ZodError) return errorResponse(400, 'VALIDATION_ERROR', '请求内容不符合要求', requestId);
    throw error;
  }
}

async function authorize(
  request: Request,
  context: AuthorHandlerContext,
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = requestIdFor(request);
  try {
    const limiter = context.rateLimiter ?? allowAllRateLimiter;
    const rate = await limiter.limit({ key: context.clientKey ?? 'unknown' });
    if (!rate.success) {
      const response = errorResponse(429, 'RATE_LIMITED', '请求过于频繁', requestId);
      response.headers.set('Retry-After', '60');
      return response;
    }
    if (!(await verifyAuthorAuthorization(request.headers.get('Authorization'), context.expectedToken))) {
      return errorResponse(401, 'UNAUTHORIZED', '作者凭据无效', requestId);
    }
    return await operation(requestId);
  } catch (error) {
    if (error instanceof SlugConflictError) return errorResponse(409, 'SLUG_CONFLICT', 'slug 已存在', requestId);
    if (error instanceof IdempotencyConflictError) {
      return errorResponse(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求', requestId);
    }
    if (error instanceof StorageUnavailableError) {
      return errorResponse(503, 'STORAGE_UNAVAILABLE', '存储服务暂时不可用', requestId);
    }
    return errorResponse(500, 'INTERNAL_ERROR', '服务暂时不可用', requestId);
  }
}

function validId(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export function createAuthorPost(request: Request, context: AuthorHandlerContext): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    const key = request.headers.get('Idempotency-Key');
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      return errorResponse(400, 'VALIDATION_ERROR', '缺少有效的 Idempotency-Key', requestId);
    }
    const input = await parseJson(request, createPostSchema, requestId);
    if (input instanceof Response) return input;
    const result = await context.posts.createIdempotently(input, key);
    return authorSuccessResponse(result.resource, requestId, 201, {
      Location: `/api/author/posts/${result.resource.id}`,
      ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
    });
  });
}

export function updateAuthorPost(request: Request, context: AuthorHandlerContext, id: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    if (!validId(id)) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    const input = await parseJson(request, updatePostSchema, requestId);
    if (input instanceof Response) return input;
    const post = await context.posts.update(id, input);
    return post ? authorSuccessResponse(post, requestId) : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}

export function deleteAuthorPost(request: Request, context: AuthorHandlerContext, id: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    if (!validId(id) || !(await context.posts.delete(id))) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    return noContentResponse(requestId);
  });
}

export function transitionAuthorPost(
  request: Request,
  context: AuthorHandlerContext,
  id: string,
  target: 'published' | 'draft',
): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    if (!validId(id)) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    if (request.body !== null) return errorResponse(400, 'VALIDATION_ERROR', '状态操作不接受请求体', requestId);
    const post = target === 'published' ? await context.posts.publish(id) : await context.posts.unpublish(id);
    return post ? authorSuccessResponse(post, requestId) : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}

export function getAuthorPostBySlug(request: Request, context: AuthorHandlerContext, slug: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    const post = await context.posts.getAuthorBySlug(slug);
    return post ? authorSuccessResponse(post, requestId) : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}

export function createAuthorProject(request: Request, context: AuthorHandlerContext): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    const key = request.headers.get('Idempotency-Key');
    if (!key || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
      return errorResponse(400, 'VALIDATION_ERROR', '缺少有效的 Idempotency-Key', requestId);
    }
    const input = await parseJson(request, createProjectSchema, requestId);
    if (input instanceof Response) return input;
    const result = await context.projects.createIdempotently(input, key);
    return authorSuccessResponse(result.resource, requestId, 201, {
      Location: `/api/author/projects/${result.resource.id}`,
      ...(result.replayed ? { 'Idempotency-Replayed': 'true' } : {}),
    });
  });
}

export function updateAuthorProject(request: Request, context: AuthorHandlerContext, id: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    if (!validId(id)) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    const input = await parseJson(request, updateProjectSchema, requestId);
    if (input instanceof Response) return input;
    const project = await context.projects.update(id, input);
    return project
      ? authorSuccessResponse(project, requestId)
      : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}

export function deleteAuthorProject(request: Request, context: AuthorHandlerContext, id: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    if (!validId(id) || !(await context.projects.delete(id))) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    return noContentResponse(requestId);
  });
}

export function getAuthorProjectBySlug(request: Request, context: AuthorHandlerContext, slug: string): Promise<Response> {
  return authorize(request, context, async (requestId) => {
    const project = await context.projects.getAuthorBySlug(slug);
    return project ? authorSuccessResponse(project, requestId) : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}
