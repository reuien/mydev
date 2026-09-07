import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Miniflare } from 'miniflare';

export async function createD1TestDatabase() {
  const miniflare = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok") } }',
    d1Databases: { DB: 'mydev-test' },
  });
  const database = await miniflare.getD1Database('DB');
  const migration = await readFile(resolve('migrations/0001_initial.sql'), 'utf8');
  const statements = migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => database.prepare(statement));
  await database.batch(statements);

  return {
    database,
    cleanup: () => miniflare.dispose(),
  };
}
