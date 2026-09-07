import { D1PostRepository } from '../../src/repositories/d1/post-repository';
import { D1ProjectRepository } from '../../src/repositories/d1/project-repository';
import { createD1TestDatabase } from '../helpers/d1-database';
import { runPostRepositoryContract } from './post-repository.contract';
import { runProjectRepositoryContract } from './project-repository.contract';

runPostRepositoryContract('D1', async () => {
  const harness = await createD1TestDatabase();
  return { repository: new D1PostRepository(harness.database), cleanup: harness.cleanup };
});

runProjectRepositoryContract('D1', async () => {
  const harness = await createD1TestDatabase();
  return { repository: new D1ProjectRepository(harness.database), cleanup: harness.cleanup };
});
