export class AuthorApiClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 5_000) {}

  async request(path: string, options: RequestInit = {}, retries = 2): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      options.signal?.throwIfAborted();
      const deadline = AbortSignal.timeout(this.timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
      try {
        const response = await this.fetcher(new URL(path, this.baseUrl), {
          ...options,
          signal,
          headers: { Authorization: `Bearer ${this.token}`, ...options.headers },
        });
        if (response.status !== 429 || attempt >= retries) return response;
        void response.body?.cancel().catch(() => {});
      } catch (error) {
        options.signal?.throwIfAborted();
        if (attempt >= retries) {
          if (deadline.aborted) throw new Error(`Author API request timed out after ${this.timeoutMs} ms per attempt`, { cause: error });
          throw error;
        }
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100 * 2 ** attempt));
    }
  }
}
