const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestIds = new WeakMap<Request, string>();

export function requestIdFor(request: Request): string {
  const existing = requestIds.get(request);
  if (existing) return existing;
  const supplied = request.headers.get('X-Request-Id');
  const id = supplied && UUID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
  requestIds.set(request, id);
  return id;
}
