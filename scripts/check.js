import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['server', 'extension', 'web', 'scripts', 'tests']) {
  for (const file of await readdir(dir)) if (file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { encoding: 'utf8' });
    if (result.status) { console.error(result.stderr); process.exitCode = 1; }
  }
}
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
if (manifest.manifest_version !== 3 || JSON.stringify(manifest).includes('OPENAI_API_KEY')) throw Error('Invalid manifest');
if (!process.exitCode) console.log('JavaScript syntax and extension manifest: OK');
