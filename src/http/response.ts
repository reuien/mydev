export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=30';
export const NO_STORE = 'no-store';

type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'STORAGE_UNAVAILABLE' | 'INTERNAL_ERROR';

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
