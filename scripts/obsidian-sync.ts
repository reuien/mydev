import { createHash } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { assertLocalAssetsExist, readContentDocument } from '../src/cli/frontmatter';
import { getResourceId } from '../src/cli/local-state';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const watch = args.includes('--watch');
const environment = args.includes('--production') ? 'production' : 'local';
const directory = resolve(process.env.MYDEV_OBSIDIAN_ROOT ?? '/Users/yuinen/Documents/ob/blogs', 'puts');
const stateFile = resolve(`.obsidian-sync-${environment}.json`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function files(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(path);
  }
  return result.sort();
}
async function run(command: string, file: string): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/publish.ts', command, file, '--env', environment], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`${command} failed`)));
  });
}
async function main() {
  let state: Record<string, string> = {};
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  console.log(`${apply ? '同步' : '预览（不上传）'}: ${directory} → ${environment}`);
  let failed = false;
  do {
    failed = false;
    const slugs = new Set<string>();
    // Validate the entire batch before sending anything, including duplicate slugs.
    const batch = [];
    for (const file of await files(directory)) {
      try {
        const document = await readContentDocument(file);
        if (document.type !== 'post') throw new Error('puts only accepts post documents');
        await assertLocalAssetsExist(document);
        if (slugs.has(document.slug)) throw new Error(`Duplicate slug: ${document.slug}`);
        slugs.add(document.slug);
        const content = await readFile(file);
        const hash = createHash('sha256').update(content).digest('hex');
        batch.push({ file, document, hash });
      } catch (error) { failed = true; console.error(file, error instanceof Error ? error.message : '校验失败'); }
    }
    if (!failed) for (const { file, document, hash } of batch) {
      if (state[document.slug] === hash) continue;
      try {
        // Wait for the file to settle before publishing an editor save.
        if (watch) {
          await sleep(2000);
          if (createHash('sha256').update(await readFile(file)).digest('hex') !== hash) continue;
        }
        console.log(`${apply ? '提交' : '待提交'}: ${document.slug}`);
        if (!apply) continue;
        const id = document.id ?? await getResourceId(environment, `post:${document.slug}`);
        await run(id ? 'update' : 'create', file);
        await run('publish', file);
        state[document.slug] = hash;
        await writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
        await rename(`${stateFile}.tmp`, stateFile);
      } catch (error) { failed = true; console.error(file, error instanceof Error ? error.message : '同步失败'); }
    }
    if (watch) await sleep(5000);
  } while (watch);
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : '同步失败'); process.exitCode = 1; });
