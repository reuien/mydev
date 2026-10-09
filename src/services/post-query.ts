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
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export type BlogPage = PageResult<PostListItem> & { groups: PostGroup[] };

export class MemoryPostQueryCache implements PostQueryCache {
  private generation = crypto.randomUUID();
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): Promise<CacheEntry<T> | null> {
    return Promise.resolve((this.entries.get(`${this.generation}:${key}`) as CacheEntry<T> | undefined) ?? null);
  }

  set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.entries.set(`${this.generation}:${key}`, entry);
    return Promise.resolve();
  }

  invalidate(): Promise<void> {
    this.generation = crypto.randomUUID();
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

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const response = await this.cache.match(await this.requestFor(key));
    return response ? ((await response.json()) as CacheEntry<T>) : null;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.cache.put(
      await this.requestFor(key),
      Response.json(entry, { headers: { 'Cache-Control': 'public, max-age=86400' } }),
    );
  }

  async invalidate(): Promise<void> {
    await this.cache.put(
      this.versionRequest,
      new Response(crypto.randomUUID(), { headers: { 'Cache-Control': 'public, max-age=31536000' } }),
    );
  }

  private async requestFor(key: string): Promise<Request> {
    return new Request(`${this.namespace}/${await this.version()}/${encodeURIComponent(key)}`);
  }

  private async version(): Promise<string> {
    const cached = await this.cache.match(this.versionRequest);
    if (cached) return cached.text();
    const version = crypto.randomUUID();
    await this.cache.put(
      this.versionRequest,
      new Response(version, { headers: { 'Cache-Control': 'public, max-age=31536000' } }),
    );
    return version;
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

  private async readThrough<T>(key: string, load: () => Promise<T>, cacheable: (value: T) => boolean): Promise<T> {
    let cached: CacheEntry<T> | null = null;
    try {
      cached = await this.cache.get<T>(key);
      if (cached && cached.freshUntil > this.now()) return cached.value;
    } catch {
      // Cache failures must never turn an otherwise healthy D1 read into an outage.
    }

    try {
      const value = await load();
      if (cacheable(value)) {
        try {
          await this.cache.set(key, { value, freshUntil: this.now() + this.freshSeconds * 1_000 });
        } catch {
          // A successful source read remains authoritative when cache persistence fails.
        }
      }
      return value;
    } catch (error) {
      if (error instanceof StorageUnavailableError && cached) return cached.value;
      throw error;
    }
  }
}
