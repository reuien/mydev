import type { PostGroupService } from '../application/post-group-service';
import type { ProjectService } from '../application/project-service';
import type { Post } from '../domain/post';
import { slugSchema } from '../schemas/common';
import type { PostQueryService } from '../services/post-query';
import { handleRequest } from '../middleware/error-handler';
import { errorResponse, successResponse } from './response';

function publicPost(post: Post) {
  const { status: _status, createdAt: _createdAt, ...result } = post;
  return result;
}

function parsePagination(request: Request): { page: number; pageSize: number } | null {
  const parameters = new URL(request.url).searchParams;
  if ([...parameters.keys()].some((key) => key !== 'page' && key !== 'pageSize')) return null;
  if (parameters.getAll('page').length > 1 || parameters.getAll('pageSize').length > 1) return null;

  const pageText = parameters.get('page') ?? '1';
  const pageSizeText = parameters.get('pageSize') ?? '10';
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(pageSizeText)) return null;

  const page = Number(pageText);
  const pageSize = Number(pageSizeText);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return null;
  }
  if (!Number.isSafeInteger((page - 1) * pageSize)) return null;
  return { page, pageSize };
}

export function handlePublicPostList(request: Request, service: PostQueryService): Promise<Response> {
  return handleRequest(request, async (requestId) => {
    const pagination = parsePagination(request);
    if (!pagination) return errorResponse(400, 'VALIDATION_ERROR', '分页参数不符合要求', requestId);
    const { page, pageSize } = pagination;
    const result = await service.listPublic({ limit: pageSize, offset: (page - 1) * pageSize });
    return successResponse(result.items, requestId, {
      page,
      pageSize,
      total: result.total,
      totalPages: result.total === 0 ? 0 : Math.ceil(result.total / pageSize),
    });
  });
}

export function handlePublicPostGroupList(request: Request, service: PostGroupService): Promise<Response> {
  return handleRequest(request, async (requestId) => successResponse(await service.list(), requestId));
}

export function handlePublicPostDetail(request: Request, service: PostQueryService, slug: string): Promise<Response> {
  return handleRequest(request, async (requestId) => {
    if (!slugSchema.safeParse(slug).success) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    const post = await service.getPublicBySlug(slug);
    return post
      ? successResponse(publicPost(post), requestId)
      : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}

export function handlePublicProjectList(request: Request, service: ProjectService): Promise<Response> {
  return handleRequest(request, async (requestId) => successResponse(await service.listPublic(), requestId));
}

export function handlePublicProjectDetail(request: Request, service: ProjectService, slug: string): Promise<Response> {
  return handleRequest(request, async (requestId) => {
    if (!slugSchema.safeParse(slug).success) return errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
    const project = await service.getPublicBySlug(slug);
    return project
      ? successResponse(project, requestId)
      : errorResponse(404, 'NOT_FOUND', '内容不存在', requestId);
  });
}
