import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { describe, expect, it } from 'vitest';
import { D1PostRepository } from '../../src/repositories/d1/post-repository';
import { D1ProjectRepository } from '../../src/repositories/d1/project-repository';
import { postFixture } from '../fixtures/posts';
import { projectFixture } from '../fixtures/projects';
import { createD1TestDatabase } from '../helpers/d1-database';

// Both requests observe the same pre-write state, deterministically exercising
// the race that a sequential replay test cannot cover. SQL/batches still run in D1.
function synchronizedLookups(database: D1Database): D1Database {
  let reads = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') return (...args: unknown[]) => wrap(target.bind(...args));
        if (property === 'first') return async (...args: Parameters<D1PreparedStatement['first']>) => {
          const result = await target.first(...args);
          const read = ++reads;
          if (read === 2) release();
          if (read <= 2) await barrier;
          return result;
        };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  return new Proxy(database, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => {
        const statement = target.prepare(sql);
        return sql.includes('FROM idempotency_keys') ? wrap(statement) : statement;
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
const operation = {
  key: 'concurrent-create', requestHash: 'a'.repeat(64),
  createdAt: '2026-09-07T00:00:00.000Z', expiresAt: '2026-09-08T00:00:00.000Z',
};

for (const kind of ['post', 'project'] as const) {
  describe(`D1 ${kind} concurrent idempotency`, () => {
    function repository(database: D1Database) {
      if (kind === 'post') {
        const repo = new D1PostRepository(database);
        return { create: (id: string, slug: string, op = operation) => repo.createIdempotently(postFixture({ id, slug }), op) };
      }
      const repo = new D1ProjectRepository(database);
      return { create: (id: string, slug: string, op = operation) => repo.createIdempotently(projectFixture({ id, slug }), op) };
    }
    it('replays a concurrent identical create and commits only one resource', async () => {
      const h = await createD1TestDatabase();
      try {
        const repo = repository(synchronizedLookups(h.database));
        const results = await Promise.all([
          repo.create(crypto.randomUUID(), 'same-slug'), repo.create(crypto.randomUUID(), 'same-slug'),
        ]);
        expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
        expect(results[0].resource).toEqual(results[1].resource);
        const count = await h.database.prepare(`SELECT COUNT(*) AS total FROM ${kind === 'post' ? 'posts' : 'projects'}`).first<{ total: number }>();
        expect(count?.total).toBe(1);
      } finally { await h.cleanup(); }
    });
    it('rejects a concurrent reuse of the key with a different payload', async () => {
      const h = await createD1TestDatabase();
      try {
        const repo = repository(synchronizedLookups(h.database));
        const results = await Promise.allSettled([
          repo.create(crypto.randomUUID(), 'one'),
          repo.create(crypto.randomUUID(), 'two', { ...operation, requestHash: 'b'.repeat(64) }),
        ]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
        expect(rejected.reason).toMatchObject({ name: 'IdempotencyConflictError' });
        const count = await h.database.prepare(`SELECT COUNT(*) AS total FROM ${kind === 'post' ? 'posts' : 'projects'}`).first<{ total: number }>();
        expect(count?.total).toBe(1);
      } finally { await h.cleanup(); }
    });
    it('does not delete the winner when concurrently replacing an expired key', async () => {
      const h = await createD1TestDatabase();
      try {
        await repository(h.database).create(crypto.randomUUID(), 'old');
        const repo = repository(synchronizedLookups(h.database));
        const next = { ...operation, createdAt: '2026-09-09T00:00:00.000Z', expiresAt: '2026-09-10T00:00:00.000Z' };
        const results = await Promise.all([
          repo.create(crypto.randomUUID(), 'new', next), repo.create(crypto.randomUUID(), 'new', next),
        ]);
        expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
        expect(results[0].resource).toEqual(results[1].resource);
        const replay = await repository(h.database).create(crypto.randomUUID(), 'new', next);
        expect(replay.replayed).toBe(true);
        expect(replay.resource).toEqual(results[0].resource);
      } finally { await h.cleanup(); }
    });
  });
}
