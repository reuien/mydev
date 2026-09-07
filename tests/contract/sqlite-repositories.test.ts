import { SqlitePostRepository } from '../../src/repositories/sqlite/post-repository';
import { SqliteProjectRepository } from '../../src/repositories/sqlite/project-repository';
import { createSqliteTestDatabase } from '../helpers/sqlite-database';
import { runPostRepositoryContract } from './post-repository.contract';
import { runProjectRepositoryContract } from './project-repository.contract';

runPostRepositoryContract('SQLite', () => {
  const harness = createSqliteTestDatabase();
  return { repository: new SqlitePostRepository(harness.database), cleanup: harness.cleanup };
});

runProjectRepositoryContract('SQLite', () => {
  const harness = createSqliteTestDatabase();
  return { repository: new SqliteProjectRepository(harness.database), cleanup: harness.cleanup };
});
