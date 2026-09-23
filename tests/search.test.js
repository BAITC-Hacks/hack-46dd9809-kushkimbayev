import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { searchProducts } from '../server/search.js';
import { LiveCatalog } from '../server/live-catalog.js';
const items = ['Кабель UTP cat.5e 4x2x0.52', 'Кабель телефонный ТРП 2x0.5', 'Кабель силовой ВВГ 3x2.5', 'Розетка телефонная RJ11', 'Коннектор UTP RJ45'].map((name, i) => ({ id: i + 100, sku: `SKU-${i + 1}`, name, specs: {}, category: 'Кабель' }));
test('twisted pair and telephone queries return the correct cable family', () => {
  assert.deepEqual(searchProducts(items, 'Витая пара').map(p => p.id), [100]);
  assert.deepEqual(searchProducts(items, 'Кабель телефонный').map(p => p.id), [101]);
  assert.deepEqual(searchProducts(items, 'Мне нужен телефонный кабель').map(p => p.id), [101]);
  assert.equal(searchProducts(items, 'кабель несуществующий').length, 0);
});
test('SKU matching respects boundaries and names are inflection tolerant', () => {
  assert.equal(searchProducts(items, 'SKU-1')[0].id, 100);
  assert.equal(searchProducts(items, 'SKU-100').length, 0);
  assert.equal(searchProducts(items, 'силового кабеля')[0].id, 102);
});
test('live name search checks more candidates when the first results are unavailable', async () => {
  const catalog = new LiveCatalog({ EKT_CACHE_FILE: path.join(os.tmpdir(), `missing-${randomUUID()}`) });
  catalog.items = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, sku: `cable-${i + 1}`, name: `Кабель UTP ${i + 1}`, specs: {} }));
  catalog.refresh = async sku => ({ ...catalog.items.find(p => p.sku === sku), stock: Number(sku.split('-')[1]) > 4 ? 10 : 0 });
  const matches = await catalog.detailsForSearch('витая пара');
  assert.equal(matches.length, 4); assert.ok(matches.every(p => p.stock === 10));
});
test('full sync follows pagination, detects API wraparound and persists index', async t => {
  const cacheFile = path.join(os.tmpdir(), `ekt-catalog-${randomUUID()}.json`);
  t.after(() => { if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile); });
  const requests = [];
  const fetcher = async url => {
    requests.push(url); const page = Number(new URL(url).searchParams.get('page'));
    const rows = page === 2 ? [{ id: 2, name: 'Кабель телефонный', article: 'B' }] : [{ id: 1, name: 'Кабель UTP', article: 'A' }];
    return { ok: true, json: async () => ({ items: rows, per_page: 1, page }) };
  };
  const catalog = new LiveCatalog({ EKT_CACHE_FILE: cacheFile }, fetcher); await catalog.sync();
  assert.equal(catalog.complete, true); assert.equal(catalog.items.length, 2); assert.equal(requests.length, 3);
  assert.ok(requests.every(url => url.includes('per_page=500')));
  const cached = new LiveCatalog({ EKT_CACHE_FILE: cacheFile }, () => { throw Error('offline'); });
  assert.equal(cached.complete, true); assert.equal(cached.search('телефонный кабель')[0].sku, 'B');
});
