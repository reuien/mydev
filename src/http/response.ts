export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=30';
export const NO_STORE = 'no-store';

export type ErrorCode =
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'SLUG_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

function json(body: unknown, status: number, requestId: string, cacheControl: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cacheControl,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': requestId,
    },
  });
}

export function successResponse(data: unknown, requestId: string, meta?: unknown): Response {
  return json(meta === undefined ? { data } : { data, meta }, 200, requestId, PUBLIC_CACHE_CONTROL);
}

export function authorSuccessResponse(
  data: unknown,
  requestId: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return Response.json({ data }, {
    status,
    headers: {
      'Cache-Control': NO_STORE,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-Id': requestId,
      ...headers,
    },
  });
}

export function noContentResponse(requestId: string): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': NO_STORE, 'X-Request-Id': requestId } });
}

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  requestId: string,
  fields?: Record<string, string>,
): Response {
  return json(
    {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        requestId,
      },
    },
    status,
    requestId,
    NO_STORE,
  );
}
