export class DomainError extends Error {
  override readonly name: string = 'DomainError';
}

export class NotFoundError extends DomainError {
  override readonly name = 'NotFoundError';
}

export class SlugConflictError extends DomainError {
  override readonly name = 'SlugConflictError';
}

export class StorageUnavailableError extends DomainError {
  override readonly name = 'StorageUnavailableError';
}

export class IdempotencyConflictError extends DomainError {
  override readonly name = 'IdempotencyConflictError';
}
