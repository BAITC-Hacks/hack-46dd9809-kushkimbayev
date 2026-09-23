import test from 'node:test';
import assert from 'node:assert/strict';
import { Element, healthy, flush, setup } from './helpers/widget-ui.js';

function assertDisconnected(ui) {
  assert.equal(ui.get('#connection').textContent, 'Расширение отключилось');
  assert.match(ui.get('#mode-note').textContent, /F5/);
  assert.doesNotMatch(ui.document.textContent, /Extension context invalidated|Start-EKT\.cmd/);
  for (const id of ['send', 'message', 'reset', 'file']) assert.equal(ui.get(`#${id}`).disabled, true, `${id} must remain disabled`);
  assert.equal(ui.document.querySelectorAll('#extension-recovery').length, 1);
}

test('invalidated runtime locks controls, shows one recovery, and never retries a request', async t => {
  for (const [name, fail] of [
    ['synchronous error', () => { throw Error('Extension context invalidated.'); }],
    ['rejected promise', () => Promise.reject(Error('Extension context invalidated.'))],
    ['missing receiver', () => Promise.reject(Error('Could not establish connection. Receiving end does not exist.'))],
    ['closed port', () => Promise.reject(Error('The message port closed before a response was received.'))],
    ['no response', () => undefined],
    ['missing response data', () => ({ serverURL: 'http://localhost:8787' })],
  ]) await t.test(name, async () => {
    const ui = await setup(message => message.path === '/api/health' ? healthy : fail());
    const actions = new Element(); actions.className = 'product-actions'; actions.append(new Element('button'), new Element('input')); ui.get('#messages').append(actions);
    await ui.context.send('Найди товар');
    assertDisconnected(ui);
    assert.ok(actions.children.every(element => element.disabled));
    assert.equal(ui.calls.filter(call => call.path === '/api/chat').length, 1);
    assert.equal(ui.reloads(), 0, 'recovery must be explicitly requested');
    await ui.context.send('Повторить');
    await ui.get('#reset').onclick();
    assert.equal(ui.calls.length, 2, 'dead UI must make no further requests');
    assert.equal(ui.document.querySelectorAll('#extension-recovery').length, 1);
    const button = ui.get('#extension-recovery').querySelector('button');
    assert.equal(button.textContent, 'Перезапустить чат');
    button.onclick();
    assert.equal(ui.reloads(), 1);
    assert.equal(ui.calls.length, 2, 'reload must not replay the failed POST');
  });
});

test('missing runtime and initial health transport failure use extension recovery', async t => {
  await t.test('chrome is absent', async () => {
    const ui = await setup(() => healthy, { missingChrome: true });
    assertDisconnected(ui); assert.equal(ui.calls.length, 0);
  });
  await t.test('health fails', async () => {
    const ui = await setup(() => Promise.reject(Error('Extension context invalidated.')));
    assertDisconnected(ui); assert.equal(ui.calls.length, 1);
  });
  await t.test('runtime disappears after initial health', async () => {
    const ui = await setup(); ui.context.chrome.runtime = undefined;
    await ui.context.send('Есть доставка?');
    assertDisconnected(ui); assert.equal(ui.calls.length, 1);
  });
});

test('failed cart confirmation is disabled and is never replayed by recovery', async () => {
  const ui = await setup(message => message.path === '/api/health' ? healthy : Promise.reject(Error('Extension context invalidated.')));
  ui.context.render({ text: 'Подтвердите добавление', proposal: { id: 'proposal-1' } });
  const confirm = ui.get('.confirmation').querySelector('button');
  await confirm.onclick();
  assertDisconnected(ui);
  assert.equal(confirm.disabled, true);
  assert.ok(ui.get('.confirmation').querySelectorAll('button').every(button => button.disabled));
  await confirm.onclick();
  ui.get('#extension-recovery').querySelector('button').onclick();
  assert.equal(ui.calls.filter(call => call.path === '/api/cart/confirm').length, 1);
});

test('late health success cannot overwrite disconnected extension status', async () => {
  let finishHealth;
  const ui = await setup(message => message.path === '/api/health' ? new Promise(resolve => { finishHealth = resolve; }) : Promise.reject(Error('Extension context invalidated.')));
  await ui.context.send('Вопрос'); finishHealth(healthy); await flush();
  assertDisconnected(ui);
});

test('ordinary server error stays retryable and does not trigger extension recovery', async () => {
  const ui = await setup(message => message.path === '/api/health' ? healthy : { error: 'Сервер не запущен. Откройте Start-EKT.cmd.' });
  await ui.context.send('Вопрос');
  assert.equal(ui.get('#extension-recovery'), null);
  assert.match(ui.get('#messages').textContent, /Сервер не запущен/);
  assert.equal(ui.get('#send').disabled, false);
  assert.equal(ui.get('#message').disabled, false);
  await ui.context.send('Повторить');
  assert.equal(ui.calls.filter(call => call.path === '/api/chat').length, 2);
  assert.equal(ui.reloads(), 0);
});
