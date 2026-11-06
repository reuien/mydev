import { open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { assertLocalAssetsExist, contentHash, parseContentDocument } from '../src/cli/frontmatter';
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
async function run(command: string, file: string, hash: string): Promise<void> {
  await new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/publish.ts', command, file, '--env', environment], { stdio: 'inherit', env: { ...process.env, MYDEV_EXPECTED_CONTENT_HASH: hash } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`${command} failed`)));
  });
}
let stopping = false;
async function sync() {
  let state: Record<string, string> = {};
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  console.log(`${apply ? '同步' : '预览（不上传）'}: ${directory} → ${environment}`);
  let failed = false;
  do {
    failed = false;
    const slugCounts = new Map<string, number>();
    // Validate the entire batch before sending anything, including duplicate slugs.
    const batch = [];
    for (const file of await files(directory)) {
      if (stopping) break;
      try {
        const content = await readFile(file);
        const document = parseContentDocument(content.toString('utf8'));
        if (document.type !== 'post') throw new Error('puts only accepts post documents');
        slugCounts.set(document.slug, (slugCounts.get(document.slug) ?? 0) + 1);
        await assertLocalAssetsExist(document);
        const hash = contentHash(content);
        batch.push({ file, document, hash });
      } catch (error) { failed = true; console.error(file, error instanceof Error ? error.message : '校验失败'); }
    }
    for (const { file, document, hash } of batch) {
      if (stopping) break;
      if ((slugCounts.get(document.slug) ?? 0) > 1) {
        failed = true;
        console.error(file, `重复文章标识：${document.slug}，已跳过`);
        continue;
      }
      if (state[document.slug] === hash) continue;
      try {
        // Wait for the file to settle before publishing an editor save.
        if (watch) {
          await sleep(2000);
          if (contentHash(await readFile(file)) !== hash) continue;
        }
        if (stopping) break;
        console.log(`${apply ? '提交' : '待提交'}: ${document.slug}`);
        if (!apply) continue;
        const id = document.id ?? await getResourceId(environment, `post:${document.slug}`);
        await run(id ? 'update' : 'create', file, hash);
        await run('publish', file, hash);
        state[document.slug] = hash;
        await writeFile(`${stateFile}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
        await rename(`${stateFile}.tmp`, stateFile);
      } catch (error) { failed = true; console.error(file, error instanceof Error ? error.message : '同步失败'); }
    }
    if (watch && !stopping) await sleep(5000);
  } while (watch && !stopping);
  if (failed) process.exitCode = 1;
}
async function main() {
  if (!apply) return sync();
  // Both environments share the publisher's local resource ID file.
  const lockPath = resolve('.obsidian-sync.lock');
  const lock = await open(lockPath, 'wx', 0o600).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') throw new Error('已有 Obsidian 同步任务，或上次异常退出。请先检查 .obsidian-sync.lock。');
    throw error;
  });
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    await lock.writeFile(`${process.pid}\n`);
    await sync();
  } finally {
    try { await lock.close(); } finally { await unlink(lockPath); }
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : '同步失败'); process.exitCode = 1; });
