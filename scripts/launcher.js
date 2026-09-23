import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
const recordPath = path.join(runtime, 'server-process.json');
const address = `http://127.0.0.1:${process.env.PORT || 8787}`;
async function health() {
  try { const r = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1500) }); return r.ok ? await r.json() : null; } catch { return null; }
}
async function main() {
  const current = await health();
  if (process.argv[2] === 'stop') {
    if (!current) { console.log('EKT server is already stopped.'); return; }
    if (!fs.existsSync(recordPath)) throw Error('This server was started separately. Stop it in its original terminal.');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    if (current.service !== 'ekt-assistant' || current.instance !== record.instance) throw Error('Process identity differs; no process was stopped.');
    process.kill(record.pid); fs.unlinkSync(recordPath); console.log('EKT server stopped.'); return;
  }
  if (current) {
    if (current.service !== 'ekt-assistant') throw Error('Port 8787 is used by another or older server. Stop that server first.');
    console.log('EKT server is already running: http://localhost:8787/install'); return;
  }
  fs.mkdirSync(runtime, { recursive: true });
  const instance = randomUUID();
  const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], { cwd: root, detached: false, windowsHide: false, stdio: 'inherit', env: { ...process.env, EKT_INSTANCE_ID: instance } });
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  process.on('SIGINT', () => { if (child.exitCode === null) child.kill('SIGINT'); });
  for (let i = 0; i < 30; i++) {
    const state = await health();
    if (state?.instance === instance) {
      fs.writeFileSync(recordPath, JSON.stringify({ pid: child.pid, instance }));
      console.log('EKT server started: http://localhost:8787/install');
      console.log('Keep this window open. To stop: Ctrl+C or Stop-EKT.cmd');
      const code = await ended;
      try { if (JSON.parse(fs.readFileSync(recordPath, 'utf8')).instance === instance) fs.unlinkSync(recordPath); } catch {}
      process.exitCode = code || 0; return;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw Error('Server did not start. See the error printed above.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
