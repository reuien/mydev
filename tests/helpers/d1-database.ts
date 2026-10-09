import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

export async function createD1TestDatabase() {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'mydev-test' },
    }),
  );
  const database = await miniflare.getD1Database('DB');
  const migrationsDirectory = resolve('migrations');
  const migrations = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrations) {
    const migration = await readFile(resolve(migrationsDirectory, file), 'utf8');
    const statements = migration
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean)
      .map((statement) => database.prepare(statement));
    await database.batch(statements);
  }

  return {
    database,
    cleanup: () => miniflare.dispose(),
  };
}
