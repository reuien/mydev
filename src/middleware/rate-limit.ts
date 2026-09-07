export interface RateLimitResult {
  success: boolean;
}

export interface AuthorRateLimiter {
  limit(options: { key: string }): Promise<RateLimitResult>;
}

export const allowAllRateLimiter: AuthorRateLimiter = {
  limit: async () => ({ success: true }),
};
