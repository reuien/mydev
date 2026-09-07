import { describe, expect, it } from 'vitest';

import { constantTimeEqual, verifyAuthorAuthorization } from '../../src/middleware/author-auth';

describe('author authentication', () => {
  it('accepts only a matching Bearer token', async () => {
    await expect(verifyAuthorAuthorization('Bearer correct-token', 'correct-token')).resolves.toBe(true);
    await expect(verifyAuthorAuthorization('Bearer wrong-token', 'correct-token')).resolves.toBe(false);
    await expect(verifyAuthorAuthorization(null, 'correct-token')).resolves.toBe(false);
    await expect(verifyAuthorAuthorization('Basic correct-token', 'correct-token')).resolves.toBe(false);
  });

  it('compares every byte and rejects different-length arrays', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});
