import { randomUUID } from 'node:crypto';

import { AuthorApiClient } from '../src/cli/client';
import { HELP, parseCommand } from '../src/cli/commands';
import { assertLocalAssetsExist, readContentDocument } from '../src/cli/frontmatter';
import { getResourceId, saveResourceId } from '../src/cli/local-state';

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.length <= 2) {
    console.log(HELP);
    return;
  }
  const command = parseCommand(process.argv.slice(2));
  const document = await readContentDocument(command.file);
  await assertLocalAssetsExist(document);
  if (command.name === 'validate') {
    console.log(`Valid ${document.type}: ${document.slug}`);
    return;
  }
  if (document.type === 'project' && (command.name === 'publish' || command.name === 'unpublish')) {
    throw new Error('Projects are public immediately and do not support publish state changes');
  }

  const production = command.environment === 'production';
  const baseUrl = production ? process.env.MYDEV_PRODUCTION_URL : process.env.MYDEV_LOCAL_URL ?? 'http://127.0.0.1:4321';
  const token = production ? process.env.MYDEV_PRODUCTION_TOKEN : process.env.AUTHOR_API_TOKEN ?? 'local-development-token';
  if (!baseUrl || !token) throw new Error('Selected environment is not configured');

  const client = new AuthorApiClient(baseUrl, token);
  const stateKey = `${document.type}:${document.slug}`;
  let id = document.id ?? (await getResourceId(command.environment, stateKey));
  const collection = document.type === 'post' ? 'posts' : 'projects';
  let response: Response;

  if (command.name === 'create') {
    response = await client.request(`/api/author/${collection}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      body: JSON.stringify(document.payload),
    });
  } else {
    if (!id) throw new Error('Resource ID is missing; create it first or add id to frontmatter');
    const action = command.name === 'publish' || command.name === 'unpublish' ? `/${command.name}` : '';
    const { slug: _slug, ...editable } = document.payload;
    const body = command.name === 'update' ? JSON.stringify(editable) : undefined;
    response = await client.request(`/api/author/${collection}/${id}${action}`, {
      method: command.name === 'delete' ? 'DELETE' : command.name === 'update' ? 'PUT' : 'POST',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body } : {}),
    });
  }

  if (!response.ok) throw new Error(`Author API failed with status ${response.status}`);
  if (response.status === 204) {
    console.log(`${document.type} ${id} deleted`);
    return;
  }
  const result = (await response.json()) as { data: { id: string; status?: string } };
  id = result.data.id;
  await saveResourceId(command.environment, stateKey, id);
  console.log(`${document.type} ${id}${result.data.status ? ` (${result.data.status})` : ''}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Publishing failed');
  process.exitCode = 1;
});
