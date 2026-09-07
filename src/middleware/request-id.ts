const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdFor(request: Request): string {
  const supplied = request.headers.get('X-Request-Id');
  return supplied && UUID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}
