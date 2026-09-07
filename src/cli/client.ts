export class AuthorApiClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}

  async request(path: string, options: RequestInit = {}, retries = 2): Promise<Response> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.fetcher(new URL(path, this.baseUrl), {
          ...options,
          headers: { Authorization: `Bearer ${this.token}`, ...options.headers },
        });
        if (response.status !== 429 || attempt >= retries) return response;
      } catch (error) {
        if (attempt >= retries) throw error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100 * 2 ** attempt));
    }
  }
}
