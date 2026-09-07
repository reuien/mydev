import { StorageUnavailableError } from '../domain/errors';
import { errorResponse } from '../http/response';
import { requestIdFor } from './request-id';

export async function handleRequest(
  request: Request,
  operation: (requestId: string) => Response | Promise<Response>,
): Promise<Response> {
  const requestId = requestIdFor(request);
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      return errorResponse(503, 'STORAGE_UNAVAILABLE', '存储服务暂时不可用', requestId);
    }
    return errorResponse(500, 'INTERNAL_ERROR', '服务暂时不可用', requestId);
  }
}
