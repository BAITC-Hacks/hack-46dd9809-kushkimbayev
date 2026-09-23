import { DemoCatalog } from './catalog.js';
import fs from 'node:fs';
import path from 'node:path';
import { searchProducts } from './search.js';
const labels = { KOLICHESTVO_POLYUSOV: 'Полюса', NOMINALNAYA_OTKLYUCHAYUSHCHAYA_SPOSOBNOST: 'Отключающая способность', NOMINALNOE_NAPRYAZHENIE: 'Напряжение', NOMINALNYY_TOK: 'Номинальный ток', TIP_USTANOVKI: 'Тип установки', TORGOVAYA_MARKA: 'Производитель', ARTIKULPOSTAVSHCHIKA: 'Артикул производителя' };
export const safeURL = value => { if (typeof value !== 'string' || !value.trim()) return null; try { const u = new URL(value, 'https://ekt.kz'); return u.protocol === 'https:' && u.hostname === 'ekt.kz' ? u.href : null; } catch { return null; } };
export function mapProduct(raw, detailed = false) {
  const props = raw.properties || {};
  const specs = Object.fromEntries(Object.entries(labels).filter(([key]) => props[key] != null).map(([key, label]) => [label, String(props[key])]));
  const nameCurrent = raw.name?.match(/(?:\s)(\d+)\s*[АA](?:\s|$)/u)?.[1];
  const propertyCurrent = String(props.NOMINALNYY_TOK ?? '').match(/^(\d+)\s*[АA]/u)?.[1];
  const warning = nameCurrent && propertyCurrent && nameCurrent !== propertyCurrent ? `В источнике есть расхождение: в названии ${nameCurrent} А, в характеристиках ${propertyCurrent} А. Уточните у менеджера; автоматический подбор аналога заблокирован.` : null;
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  return { id: raw.id, sku: String(raw.article || raw.id), name: String(raw.name), price: numeric(raw.price), currency: 'KZT',
    category: props.OBYEM || 'Каталог ekt.kz', brand: props.TORGOVAYA_MARKA || '', unit: 'ед.', minOrder: Number(props.KRATNOST_MIN) || 1,
    warehouses: (raw.stores || []).map(w => ({ name: String(w.name), stock: numeric(w.quantity) ?? 0 })),
    stock: detailed ? numeric(raw.quantity) : null, stockKnown: detailed && numeric(raw.quantity) !== null,
    specs, description: String(raw.description || '').replace(/<[^>]*>/g, '').slice(0, 5000), certificates: [],
    image: safeURL(raw.image), url: safeURL(raw.url), warning, detailed, checkedAt: detailed ? new Date().toISOString() : null,
    compatibility: null, source: 'ekt.kz API' };
}
export class LiveCatalog extends DemoCatalog {
  constructor(env = process.env, fetcher = fetch) {
    super([]); this.env = env; this.fetcher = fetcher; this.live = true; this.syncing = false; this.pages = 0; this.complete = false; this.error = null;
    this.cacheFile = path.resolve(env.EKT_CACHE_FILE || '.runtime/catalog-index.json');
    try { const cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); if (cache.version === 1 && Array.isArray(cache.items)) { this.items = cache.items; this.complete = cache.complete; this.pages = cache.pages; this.updatedAt = cache.updatedAt; } } catch {}
  }
  async request(endpoint) {
    const base = this.env.EKT_API_BASE || 'https://ekt.kz/api';
    if (base !== 'https://ekt.kz/api') throw new Error('EKT_API_BASE must be https://ekt.kz/api');
    const r = await this.fetcher(`${base}${endpoint}`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${this.env.EKT_API_USER}:${this.env.EKT_API_PASSWORD}`).toString('base64')}` } });
    if (!r.ok) throw new Error(`EKT API ${r.status}`);
    return r.json();
  }
  async refresh(sku) {
    const p = this.get(sku); if (!p) return null;
    const raw = await this.request(`/products/detail?id=${encodeURIComponent(p.id)}`);
    const updated = mapProduct(raw, true);
    const index = this.items.findIndex(x => x.id === updated.id);
    if (index >= 0) this.items[index] = updated; else this.items.push(updated);
    return updated;
  }
  async byId(id) {
    const raw = await this.request(`/products/detail?id=${encodeURIComponent(id)}`);
    if (!raw.id || !raw.name) return null;
    const p = mapProduct(raw, true); const existing = this.items.findIndex(x => x.id === p.id);
    if (existing >= 0) this.items[existing] = p; else this.items.push(p);
    return p;
  }
  async detailsForSearch(query, fallback = []) {
    const indexed = searchProducts(this.items, query, 16);
    const candidates = indexed.length ? indexed : fallback;
    const checked = [];
    for (let i = 0; i < candidates.length; i += 4) {
      const batch = await Promise.all(candidates.slice(i, i + 4).map(p => this.refresh(p.sku)));
      checked.push(...batch.filter(Boolean));
      if (checked.filter(p => p.stock > 0).length >= 4) break;
    }
    return checked.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0)).slice(0, 4);
  }
  async sync(maxPages = Number(this.env.EKT_SYNC_MAX_PAGES || 1000)) {
    if (this.syncing) return;
    this.syncing = true;
    const index = new Map();
    const signatures = new Set();
    let finished = false;
    try {
      for (let page = 1; page <= maxPages; page++) {
        const data = await this.request(`/products?per_page=500&page=${page}`);
        if (!Array.isArray(data.items)) throw new Error('Unexpected catalog format');
        const signature = data.items.map(x => x.id).join(',');
        // This API wraps out-of-range page requests back to the first page.
        if (!data.items.length || signatures.has(signature)) { finished = true; break; }
        signatures.add(signature);
        for (const raw of data.items) index.set(raw.id, mapProduct(raw));
        if (!this.complete) this.items = [...index.values()];
        this.pages = page;
        console.log(`[catalog] page ${page}: ${index.size} products indexed`);
        if (data.items.length < data.per_page) { finished = true; break; }
      }
      if (!finished) throw Error('Catalog page limit reached');
      this.items = [...index.values()]; this.complete = true; this.updatedAt = new Date().toISOString();
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(`${this.cacheFile}.tmp`, JSON.stringify({ version: 1, complete: true, pages: this.pages, updatedAt: this.updatedAt, items: this.items }));
      fs.renameSync(`${this.cacheFile}.tmp`, this.cacheFile);
      this.error = null;
      console.log(`[catalog] ready: ${this.items.length} products; index saved`);
    } catch { this.error = 'Не удалось завершить обновление каталога. Поиск использует уже загруженные товары.'; console.error(`[catalog] ${this.error}`); }
    finally { this.syncing = false; }
  }
  alternatives() { return []; } // No verified compatibility mapping has been supplied by the partner.
}
