import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { createSqliteClient } from '../../src/repositories/sqlite/client';

export type SqliteTestDatabase = {
  database: DatabaseSync;
  cleanup: () => void;
};

export function createSqliteTestDatabase(): SqliteTestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'mydev-sqlite-'));
  const database = createSqliteClient(join(directory, 'test.sqlite'));
  for (const name of ['0001_initial.sql', '0002_post_groups.sql']) {
    database.exec(readFileSync(resolve('migrations', name), 'utf8'));
  }

  return {
    database,
    cleanup: () => {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
