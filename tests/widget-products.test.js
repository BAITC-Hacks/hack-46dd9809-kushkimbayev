import test from 'node:test';
import assert from 'node:assert/strict';
import { healthy, setup } from './helpers/widget-ui.js';

const product = {
  id: '515291', sku: '200300285_', name: 'Кабель телефонный',
  price: 125.5, stock: 100, stockKnown: true, unit: 'м', minOrder: 2,
  specs: { 'Число жил': '4' }, warehouses: [{ name: 'Алматы', stock: 100 }], certificates: [],
  url: 'https://ekt.kz/catalog/kabel-telefonnyy/',
};
const amount = (price, quantity) => `${(price * quantity).toLocaleString('ru-RU')} ₸`;

test('product total follows the selected quantity and preparing never confirms the cart', async () => {
  const alerts = [];
  const ui = await setup(message => {
    if (message.path === '/api/health') return healthy;
    if (message.path === '/api/cart/prepare') return { ...healthy, data: { text: 'Подтвердите добавление', proposal: { id: 'proposal-1' } } };
    if (message.path === '/api/cart/confirm') return { ...healthy, data: { text: 'Подтверждено', action: { id: 'action-1', type: 'add_to_cart', name: product.name, quantity: 5, unit: product.unit } } };
    assert.fail(`Unexpected request: ${message.path}`);
  }, { onAlert: text => alerts.push(text) });

  ui.context.render({ text: 'Найден товар', products: [product] });
  const card = ui.get('.product-card');
  const quantity = card.querySelector('.quantity');
  const add = card.querySelector('.primary');
  const total = card.querySelector('.purchase-total');
  assert.equal(Number(quantity.value), product.minOrder);
  assert.ok(total.textContent.includes(amount(product.price, product.minOrder)));
  quantity.value = '5'; quantity.oninput();
  assert.ok(total.textContent.includes(amount(product.price, 5)));
  await add.onclick();

  const prepare = ui.calls.find(call => call.path === '/api/cart/prepare');
  assert.equal(prepare.body.sku, product.sku);
  assert.equal(prepare.body.quantity, 5);
  assert.equal(ui.calls.filter(call => call.path === '/api/cart/confirm').length, 0);
  assert.equal(alerts.length, 0);
  await ui.get('.confirmation').querySelector('.primary').onclick();
  assert.equal(ui.calls.filter(call => call.path === '/api/cart/confirm').length, 1);
  assert.equal(alerts.length, 1);
});

test('unknown availability cannot be presented as an available purchase', async () => {
  const ui = await setup(message => message.path === '/api/health' ? healthy : { ...healthy, data: { text: 'Проверяю наличие' } });
  ui.context.render({ text: 'Найден товар', products: [{ ...product, stockKnown: false, stock: null, warehouses: [] }] });
  const card = ui.get('.product-card');
  assert.doesNotMatch(card.querySelector('.stock').textContent, /В наличии/);
  const button = card.querySelector('.primary');
  if (!button.disabled) await button.onclick();
  assert.equal(ui.calls.filter(call => call.path.startsWith('/api/cart/')).length, 0);
});

test('missing price or insufficient stock disables purchase and never invents a zero price', async t => {
  for (const [label, change] of [
    ['unknown price', { price: null }],
    ['out of stock', { stock: 0, warehouses: [] }],
    ['below minimum order', { stock: 1, warehouses: [{ name: 'Алматы', stock: 1 }] }],
  ]) await t.test(label, async () => {
    const ui = await setup();
    ui.context.render({ text: 'Найден товар', products: [{ ...product, ...change }] });
    const card = ui.get('.product-card');
    assert.equal(card.querySelector('.primary').disabled, true);
    if (change.price === null) {
      assert.doesNotMatch(card.querySelector('.product-price').textContent, /\b0\s*₸/);
      assert.doesNotMatch(card.querySelector('.purchase-total').textContent, /\b0\s*₸/);
    }
    assert.equal(ui.calls.filter(call => call.path.startsWith('/api/cart/')).length, 0);
  });
});
