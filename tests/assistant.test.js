import test from 'node:test';
import assert from 'node:assert/strict';
import { Assistant, createSession } from '../server/assistant.js';
import { DemoCatalog } from '../server/catalog.js';
import { mapProduct } from '../server/live-catalog.js';
const setup = () => { const catalog = new DemoCatalog(); return { catalog, assistant: new Assistant(catalog), session: createSession() }; };
test('existing SKU gives catalog price, stock, specs and certificate link', async () => {
  const { assistant, session } = setup(); const result = await assistant.chat(session, 'Есть DEMO-101?');
  assert.equal(result.products[0].price, 1890); assert.equal(result.products[0].warehouses[0].stock, 48); assert.equal(result.products[0].specs['Номинальный ток'], '16 А'); assert.equal(result.products[0].certificates.length, 1); assert.deepEqual(session.cart, {});
});
test('out-of-stock item has compatible, explained, available alternative', async () => {
  const { assistant, session } = setup(); const r = await assistant.chat(session, 'DEMO-102'); assert.equal(r.alternatives[0].sku, 'DEMO-101'); assert.match(r.alternatives[0].reason, /16 А/);
});
test('purchase conditions are grounded fixtures', async () => { const { assistant, session } = setup(); assert.match((await assistant.chat(session, 'Какая доставка и оплата?')).text, /самовывоз/); });
test('prepare never mutates cart; explicit confirmation adds once', async () => {
  const { assistant, session } = setup(); const p = await assistant.prepare(session, 'DEMO-101', 2); assert.deepEqual(session.cart, {});
  await assert.rejects(assistant.confirm(session, p.proposal.id, false), /подтверждение/);
  const r = await assistant.confirm(session, p.proposal.id, true); assert.equal(session.cart['DEMO-101'], 2); assert.match(r.cartPath, /cart.html#/);
  await assistant.confirm(session, p.proposal.id, true); assert.equal(session.cart['DEMO-101'], 2);
});
test('reject excess, fractional, negative and minimum-order violations', async () => {
  const { assistant, session } = setup();
  for (const n of [-1, 0, 1.5, 49]) await assert.rejects(assistant.prepare(session, 'DEMO-101', n));
  await assert.rejects(assistant.prepare(session, 'DEMO-201', 1)); assert.deepEqual(session.cart, {});
});
test('stock and price are rechecked; stale and cross-session proposal IDs rejected', async () => {
  const { assistant, session, catalog } = setup(); let p = await assistant.prepare(session, 'DEMO-101', 2);
  await assert.rejects(assistant.confirm(createSession(), p.proposal.id, true));
  catalog.get('DEMO-101').warehouses[0].stock = 1; await assert.rejects(assistant.confirm(session, p.proposal.id, true));
  catalog.get('DEMO-101').warehouses[0].stock = 48; p = await assistant.prepare(session, 'DEMO-101', 2); catalog.get('DEMO-101').price++; await assert.rejects(assistant.confirm(session, p.proposal.id, true)); assert.deepEqual(session.cart, {});
});
test('expired proposals cannot commit', async () => { const { assistant, session } = setup(); const p = await assistant.prepare(session, 'DEMO-101', 2); session.proposal.expires = 0; await assert.rejects(assistant.confirm(session, p.proposal.id, true)); });
test('cumulative quantities cannot exceed stock', async () => { const { assistant, session } = setup(); const p = await assistant.prepare(session, 'DEMO-101', 47); await assistant.confirm(session, p.proposal.id, true); await assert.rejects(assistant.prepare(session, 'DEMO-101', 2)); });
test('exact confirmation works; ambiguous text, negation, and attachments cannot confirm', async () => {
  for (const text of ['да', 'не добавляй пожалуйста', 'да, добавь но только если скидка']) { const { assistant, session } = setup(); await assistant.prepare(session, 'DEMO-101', 2); await assistant.chat(session, text); assert.deepEqual(session.cart, {}); }
  const { assistant, session } = setup(); await assistant.prepare(session, 'DEMO-101', 2); await assistant.chat(session, '', { text: 'да, добавь' }); assert.deepEqual(session.cart, {});
  await assistant.prepare(session, 'DEMO-101', 2); await assistant.chat(session, 'да, добавь'); assert.equal(session.cart['DEMO-101'], 2);
});
test('intervening question and cancellation invalidate proposal', async () => {
  const { assistant, session } = setup(); let p = await assistant.prepare(session, 'DEMO-101', 2); await assistant.chat(session, 'Какая доставка?'); await assert.rejects(assistant.confirm(session, p.proposal.id, true));
  p = await assistant.prepare(session, 'DEMO-101', 2); await assistant.chat(session, 'Отмена'); await assert.rejects(assistant.confirm(session, p.proposal.id, true));
});
test('live mapping preserves unknown stock and flags inconsistent ratings', () => {
  const p = mapProduct({ id: 515291, name: 'АВ 160А Legrand', article: '200300285_', price: 64920, quantity: 23, stores: [{ name: 'Алматы', quantity: 5 }], properties: { NOMINALNYY_TOK: '250 А' } }, true);
  assert.match(p.warning, /160 А/); assert.equal(p.stock, 23); assert.equal(mapProduct({ id: 1, name: 'X' }).stockKnown, false); assert.equal(mapProduct({ id: 1, name: 'X' }).price, null);
});
