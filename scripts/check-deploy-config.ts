import { readFile } from 'node:fs/promises';

type WranglerConfig = {
  d1_databases?: Array<{ binding?: string; database_id?: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function checkDeployConfig(path = 'wrangler.jsonc'): Promise<void> {
  const source = await readFile(path, 'utf8');
  const config = JSON.parse(source) as WranglerConfig;
  const database = config.d1_databases?.find(({ binding }) => binding === 'DB');

  if (!database) {
    throw new Error('wrangler.jsonc must define a D1 binding named DB');
  }
  if (!database.database_id || !UUID_PATTERN.test(database.database_id)) {
    throw new Error(
      'Replace the DB database_id placeholder in wrangler.jsonc with the UUID returned by `wrangler d1 create mydev`.',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkDeployConfig().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
