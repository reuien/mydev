import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { TargetEnvironment } from './commands';

const STATE_FILE = resolve('.mydev-state.json');
type State = Partial<Record<TargetEnvironment, Record<string, string>>>;

async function readState(): Promise<State> {
  try { return JSON.parse(await readFile(STATE_FILE, 'utf8')) as State; } catch { return {}; }
}

export async function getResourceId(environment: TargetEnvironment, key: string): Promise<string | undefined> {
  return (await readState())[environment]?.[key];
}

export async function saveResourceId(environment: TargetEnvironment, key: string, id: string): Promise<void> {
  const state = await readState();
  state[environment] = { ...state[environment], [key]: id };
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
