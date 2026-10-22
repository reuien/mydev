import { StorageUnavailableError } from '../domain/errors';
import type { Post } from '../domain/post';
import type { PostGroup } from '../domain/post-group';
import type { PostGroupRepository } from '../repositories/post-group-repository';
import type { PageRequest, PageResult, PostListItem, PostRepository } from '../repositories/post-repository';

type CacheEntry<T> = { value: T; freshUntil: number };

export interface PostQueryInvalidator {
  invalidate(): Promise<void>;
}

export interface PostQueryCache extends PostQueryInvalidator {
  version(): Promise<string>;
  get<T>(key: string, version?: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>, version?: string): Promise<void>;
}

export type BlogPage = PageResult<PostListItem> & { groups: PostGroup[] };

export class MemoryPostQueryCache implements PostQueryCache {
  // This cache is also instantiated at module scope. Workers only permit
  // random number generation inside a request, so use a local counter.
  private generation = 0;
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  version(): Promise<string> {
    return Promise.resolve(String(this.generation));
  }

  get<T>(key: string, version = String(this.generation)): Promise<CacheEntry<T> | null> {
    return Promise.resolve((this.entries.get(`${version}:${key}`) as CacheEntry<T> | undefined) ?? null);
  }

  set<T>(key: string, entry: CacheEntry<T>, version = String(this.generation)): Promise<void> {
    if (version === String(this.generation)) this.entries.set(`${version}:${key}`, entry);
    return Promise.resolve();
  }

  invalidate(): Promise<void> {
    this.generation += 1;
    this.entries.clear();
    return Promise.resolve();
  }
}

export class CloudflarePostQueryCache implements PostQueryCache {
  private readonly versionRequest: Request;

  constructor(
    private readonly cache: Cache,
    namespace = 'https://cache.mydev.internal/post-query',
  ) {
    this.versionRequest = new Request(`${namespace}/version`);
    this.namespace = namespace;
  }

  private readonly namespace: string;

  async get<T>(key: string, version?: string): Promise<CacheEntry<T> | null> {
    const response = await this.cache.match(await this.requestFor(key, version));
    return response ? ((await response.json()) as CacheEntry<T>) : null;
  }

  async set<T>(key: string, entry: CacheEntry<T>, version?: string): Promise<void> {
    await this.cache.put(
      await this.requestFor(key, version),
      Response.json(entry, { headers: { 'Cache-Control': 'public, max-age=86400' } }),
    );
  }

  async invalidate(): Promise<void> {
    await this.cache.put(
      this.versionRequest,
      new Response(crypto.randomUUID(), { headers: { 'Cache-Control': 'public, max-age=31536000' } }),
    );
  }

  private async requestFor(key: string, version?: string): Promise<Request> {
    return new Request(`${this.namespace}/${version ?? await this.version()}/${encodeURIComponent(key)}`);
  }

  async version(): Promise<string> {
    const cached = await this.cache.match(this.versionRequest);
    // A stable initial version avoids a cold reader overwriting an invalidation.
    return cached ? cached.text() : 'initial';
  }

}

const fallbackCache = new MemoryPostQueryCache();

export function createPostQueryCache(): PostQueryCache {
  const workerCaches = globalThis.caches as CacheStorage & { default?: Cache };
  return workerCaches?.default ? new CloudflarePostQueryCache(workerCaches.default) : fallbackCache;
}

export class PostQueryService {
  constructor(
    private readonly posts: PostRepository,
    private readonly groups: PostGroupRepository,
    private readonly cache: PostQueryCache,
    private readonly now: () => number = Date.now,
    private readonly freshSeconds = 300,
    private readonly reportCacheFailure: (error: unknown, operation: string) => void = () => undefined,
  ) {}

  listPublic(page: PageRequest): Promise<PageResult<PostListItem>> {
    return this.readThrough(
      `list:${page.limit}:${page.offset}`,
      () => this.posts.listPublic(page),
      (result) => result.total > 0,
    );
  }

  getPublicBySlug(slug: string): Promise<Post | null> {
    return this.readThrough(`detail:${slug}`, () => this.posts.findPublicBySlug(slug), (post) => post !== null);
  }

  listBlogPage(page: PageRequest): Promise<BlogPage> {
    return this.readThrough(
      `blog:${page.limit}:${page.offset}`,
      async () => {
        const [result, groups] = await Promise.all([this.posts.listPublic(page), this.groups.list()]);
        return { ...result, groups };
      },
      (result) => result.total > 0,
    );
  }

  private reportFailure(error: unknown, operation: string): void {
    try { this.reportCacheFailure(error, operation); } catch { /* Optional diagnostics. */ }
  }

  private async readThrough<T>(key: string, load: () => Promise<T>, cacheable: (value: T) => boolean): Promise<T> {
    let cached: CacheEntry<T> | null = null;
    let version: string | undefined;
    try {
      version = await this.cache.version();
      cached = await this.cache.get<T>(key, version);
      if (cached && cached.freshUntil > this.now()) return cached.value;
    } catch (error) {
      this.reportFailure(error, 'cache-read');
      // Cache failures must never turn an otherwise healthy D1 read into an outage.
    }

    try {
      const value = await load();
      if (version !== undefined) {
        try {
          // Also replace stale positive entries when storage confirms null/empty.
          // These results expire immediately but remain safe outage fallbacks.
          await this.cache.set(key, {
            value,
            freshUntil: this.now() + (cacheable(value) ? this.freshSeconds * 1_000 : 0),
          }, version);
        } catch (error) {
          this.reportFailure(error, 'cache-write');
          // A successful source read remains authoritative when cache persistence fails.
        }
      }
      return value;
    } catch (error) {
      if (error instanceof StorageUnavailableError && cached && version !== undefined) {
        try {
          if (await this.cache.version() === version) {
            this.reportFailure(error, 'storage-stale-fallback');
            return cached.value;
          }
        } catch (cacheError) {
          this.reportFailure(cacheError, 'cache-fallback-version');
          // Without a version check, an invalidated entry is not a safe fallback.
        }
      }
      throw error;
    }
  }
}
