import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
function setup(response, { sendMessage = async () => ({ opened: true }) } = {}) {
  let handler, toolbarHandler; const opened = [], sent = [], fetched = []; const saved = { sessionToken: 'token', sessionServer: 'http://localhost:8787' };
  const chrome = {
    action: { onClicked: { addListener: fn => { toolbarHandler = fn; } } },
    runtime: { id: 'test', getURL: name => `chrome-extension://test/${name}`, onMessage: { addListener: fn => { handler = fn; } } },
    storage: { session: { get: async () => saved, set: async value => Object.assign(saved, value), remove: async () => {} } },
    tabs: { create: async options => { opened.push(options); }, sendMessage: async (tabId, message) => { sent.push({ tabId, message }); return sendMessage(tabId, message); } },
  };
  vm.runInNewContext(source, { chrome, importScripts() {}, EKT_CONFIG: { serverURL: 'http://localhost:8787' }, URL, AbortSignal, fetch: async (...args) => { fetched.push(args); return { ok: true, json: async () => structuredClone(response) }; } });
  return { opened, sent, fetched, handler, toolbarHandler };
}
async function run(response, message = { type: 'api', path: '/api/chat', method: 'POST', body: { message: 'SKU-1' } }) {
  const worker = setup(response);
  const result = await new Promise(resolve => worker.handler(message, { id: 'test', url: 'chrome-extension://test/widget.html' }, resolve));
  return { ...worker, result };
}
test('worker opens an exact product in an active tab without needing a popup permission', async () => {
  const response = { matchType: 'exact', navigation: { type: 'open_product', url: 'https://ekt.kz/catalog/cable/item/' } };
  const { opened, result } = await run(response);
  assert.equal(opened.length, 1); assert.equal(opened[0].url, response.navigation.url); assert.equal(opened[0].active, true); assert.equal(result.data.navigation.opened, true);
});
test('worker does not open partial results, attachment matches, or unsafe URLs', async () => {
  for (const url of ['https://ekt.kz.evil.test/catalog/item/', 'https://ekt.kz/personal/', 'javascript:alert(1)', 'https://user:pass@ekt.kz/catalog/item/']) {
    assert.equal((await run({ matchType: 'exact', navigation: { type: 'open_product', url } })).opened.length, 0);
  }
  const response = { matchType: 'exact', navigation: { type: 'open_product', url: 'https://ekt.kz/catalog/item/' } };
  assert.equal((await run({ ...response, matchType: 'partial' })).opened.length, 0);
  assert.equal((await run(response, { type: 'api', path: '/api/chat', method: 'POST', body: { message: 'SKU-1', attachment: {} } })).opened.length, 0);
});

test('worker accepts authenticated standalone and embedded widget requests', async () => {
  for (const url of ['chrome-extension://test/widget.html', 'chrome-extension://test/widget.html?embedded=1']) {
    const worker = setup({ status: 'ok' });
    const result = await new Promise(resolve => {
      const pending = worker.handler({ type: 'api', path: '/api/health', method: 'GET' }, { id: 'test', url }, resolve);
      assert.equal(pending, true, url);
    });
    assert.equal(result.data.status, 'ok');
    assert.equal(worker.fetched.length, 1);
    assert.equal(worker.fetched[0][0], 'http://localhost:8787/api/health');
  }
});

test('worker denies altered widget URLs, lookalikes, page senders, and another extension', () => {
  const forbiddenSenders = [
    ...[
      'chrome-extension://test/widget.html?embedded=2',
      'chrome-extension://test/widget.html?embedded=1&debug=1',
      'chrome-extension://test/widget.html?embedded=1&embedded=1',
      'chrome-extension://test/widget.html#embedded=1',
      'chrome-extension://test/widget.html/',
      'chrome-extension://test.evil/widget.html?embedded=1',
      'chrome-extension://test/other.html',
      'https://ekt.kz/widget.html?embedded=1',
      'https://ekt.kz/catalog/item/',
      undefined,
    ].map(url => ({ id: 'test', url })),
    { id: 'another-extension', url: 'chrome-extension://test/widget.html?embedded=1' },
    { url: 'chrome-extension://test/widget.html?embedded=1' },
  ];
  for (const sender of forbiddenSenders) {
    const worker = setup({ status: 'ok' });
    assert.equal(worker.handler({ type: 'api', path: '/api/health', method: 'GET' }, sender, () => assert.fail('Untrusted request must not receive a reply')), undefined);
    assert.equal(worker.fetched.length, 0, JSON.stringify(sender));
    assert.equal(worker.opened.length, 0);
  }
});

test('toolbar opens the current tab consultant without creating another tab when accepted', async () => {
  const worker = setup({});
  await worker.toolbarHandler({ id: 42, url: 'https://ekt.kz/catalog/item/' });
  assert.equal(worker.sent.length, 1);
  assert.equal(worker.sent[0].tabId, 42);
  assert.equal(worker.sent[0].message.type, 'ekt-assistant-open');
  assert.equal(worker.opened.length, 0);
  assert.equal(worker.fetched.length, 0);
});

test('toolbar falls back to ekt.kz when the current tab cannot open the consultant', async () => {
  for (const sendMessage of [async () => undefined, async () => ({ opened: false }), async () => { throw Error('No receiver'); }]) {
    const worker = setup({}, { sendMessage });
    await worker.toolbarHandler({ id: 42 });
    assert.equal(worker.sent.length, 1);
    assert.equal(worker.opened.length, 1);
    assert.equal(worker.opened[0].url, 'https://ekt.kz');
  }
  const worker = setup({});
  await worker.toolbarHandler(undefined);
  assert.equal(worker.sent.length, 0);
  assert.equal(worker.opened.length, 1);
  assert.equal(worker.opened[0].url, 'https://ekt.kz');
});
