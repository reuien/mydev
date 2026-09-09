import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { checkDeployConfig } from '../../scripts/check-deploy-config';

describe('deployment configuration', () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function configPath(databaseId: string) {
    const directory = await mkdtemp(join(tmpdir(), 'mydev-deploy-config-'));
    directories.push(directory);
    const path = join(directory, 'wrangler.jsonc');
    await writeFile(path, JSON.stringify({ d1_databases: [{ binding: 'DB', database_id: databaseId }] }));
    return path;
  }

  it('rejects a placeholder D1 database ID before deployment', async () => {
    await expect(checkDeployConfig(await configPath('replace-with-cloudflare-d1-database-id'))).rejects.toThrow(
      'Replace the DB database_id placeholder',
    );
  });

  it('accepts a real D1 database UUID', async () => {
    await expect(checkDeployConfig(await configPath('123e4567-e89b-42d3-a456-426614174000'))).resolves.toBeUndefined();
  });
});
