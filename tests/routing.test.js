import test from 'node:test';
import assert from 'node:assert/strict';
import { Assistant, createSession } from '../server/assistant.js';
import { DemoCatalog } from '../server/catalog.js';
import { exactProductMatch } from '../server/search.js';

function setup() {
  const catalog = new DemoCatalog();
  catalog.items.forEach(p => { p.url = `https://ekt.kz/catalog/test/${p.sku.toLowerCase()}/`; });
  let calls = 0, context;
  const assistant = new Assistant(catalog, { enabled: true, interpret: async (_question, _session, _image, ctx) => {
    calls++; context = ctx;
    return { intent: 'site_info', answer: 'Материалы и инструкции размещены в разделе полезной информации.', source_urls: ['https://ekt.kz/about/information/'] };
  } });
  return { catalog, assistant, calls: () => calls, context: () => context };
}
test('exact SKU and complete normalized product name open only that product', async () => {
  const { assistant, catalog, calls } = setup(); const p = catalog.get('DEMO-101');
  for (const query of ['DEMO-101', 'Артикул: DEMO-101', p.name, `  ${p.name.toUpperCase().replaceAll(' ', '  ')}  `]) {
    const result = await assistant.chat(createSession(), query);
    assert.equal(result.matchType, 'exact'); assert.equal(result.navigation.url, p.url); assert.equal(result.navigation.type, 'open_product'); assert.deepEqual(result.products, []); assert.equal(result.action, undefined);
  }
  assert.equal(calls(), 0);
});
test('partial names show relevant products; informational SKU queries do not auto-open', async () => {
  const { assistant, calls } = setup();
  for (const query of ['автоматический выключатель', 'кабель', 'Есть DEMO-101?']) {
    const result = await assistant.chat(createSession(), query);
    assert.equal(result.matchType, 'partial'); assert.ok(result.products.length); assert.equal(result.navigation, undefined);
  }
  assert.equal(calls(), 0);
});
test('duplicate full names stay in chat, and HTML entities are decoded for exact name matching', async () => {
  const { catalog, assistant } = setup();
  catalog.items[0].name = 'Розетка &quot;Atlas&quot;';
  assert.equal(exactProductMatch(catalog.items, 'Розетка "Atlas"').products[0].sku, 'DEMO-101');
  catalog.items[1].name = catalog.items[0].name;
  const result = await assistant.chat(createSession(), 'Розетка "Atlas"');
  assert.equal(result.navigation, undefined);
});
test('attachments, lookalike domains and model-generated product intents cannot auto-navigate', async () => {
  const { catalog, assistant } = setup();
  const attachment = await assistant.chat(createSession(), 'DEMO-101', { text: 'DEMO-101' }); assert.equal(attachment.navigation, undefined);
  for (const url of ['https://ekt.kz.evil.test/catalog/a', 'javascript:alert(1)', 'https://user:pass@ekt.kz/catalog/a', 'https://ekt.kz/personal/cart/']) {
    catalog.items[0].url = url;
    const response = await assistant.chat(createSession(), 'DEMO-101'); assert.equal(response.navigation, undefined);
  }
});
test('non-product question routes to research, carries sources and cannot buy or navigate', async () => {
  const { assistant, calls, context } = setup();
  const result = await assistant.chat(createSession(), 'Как получить инструкции по использованию сайта?');
  assert.equal(calls(), 1); assert.equal(context().researchOnly, true); assert.equal(result.answerMode, 'research-ai'); assert.equal(result.sources[0].url, 'https://ekt.kz/about/information/'); assert.equal(result.navigation, undefined); assert.equal(result.action, undefined);
});
test('out-of-scope research answer states lack of evidence without invented facts', async () => {
  const { assistant } = setup(); assistant.ai.interpret = async () => ({ intent: 'unknown', answer: 'Invented answer', source_urls: [] });
  const result = await assistant.chat(createSession(), 'Какая погода на Марсе?');
  assert.equal(result.answerMode, 'research-unavailable'); assert.match(result.text, /нет достаточных сведений/); assert.ok(!result.text.includes('Invented'));
});
test('EKT PRO question uses research even when product fragments incidentally match', async () => {
  const { catalog, assistant, calls } = setup();
  catalog.items.push({ sku: '311100843_', name: 'Детектор напряжения бесконтактный КТ 90 PROLINE', category: 'Каталог ekt.kz', specs: {} });
  const result = await assistant.chat(createSession(), 'Что такое EKT PRO?');
  assert.equal(result.answerMode, 'research-ai');
  assert.deepEqual(result.products, []);
  assert.equal(calls(), 1);
});
