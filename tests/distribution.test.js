import test from 'node:test';
import assert from 'node:assert/strict';
import Zip from 'adm-zip';
import { extensionFiles, extensionZip, extensionOrigin } from '../server/distribution.js';
test('release is preconfigured with a stable extension ID and contains no server secrets', () => {
  const files = extensionFiles('http://localhost:8787');
  const manifest = JSON.parse(files['manifest.json']);
  assert.match(extensionOrigin, /^chrome-extension:\/\/[a-p]{32}$/);
  assert.deepEqual(manifest.host_permissions, ['http://localhost:8787/*']);
  assert.ok(manifest.key); assert.equal(manifest.options_page, undefined); assert.equal(manifest.optional_host_permissions, undefined);
  assert.match(files['config.js'].toString(), /http:\/\/localhost:8787/);
  const archive = new Zip(extensionZip('http://localhost:8787'));
  assert.equal(archive.getEntries().length, 8);
  for (const entry of archive.getEntries()) { assert.ok(!entry.entryName.includes('.env')); assert.ok(!/EKT_API_PASSWORD|OPENAI_API_KEY|Basic /.test(entry.getData().toString())); }
});
test('unsafe and credential-containing release addresses are rejected', () => {
  for (const url of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?secret=1']) assert.throws(() => extensionFiles(url));
});
