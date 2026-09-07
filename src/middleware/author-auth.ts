const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function verifyAuthorAuthorization(header: string | null, expectedToken: string): Promise<boolean> {
  const match = header?.match(/^Bearer ([^\s]{1,4096})$/);
  const candidate = match?.[1] ?? '';
  const [candidateDigest, expectedDigest] = await Promise.all([digest(candidate), digest(expectedToken)]);
  return Boolean(match) && constantTimeEqual(candidateDigest, expectedDigest);
}
