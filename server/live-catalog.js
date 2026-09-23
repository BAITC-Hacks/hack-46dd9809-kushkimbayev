import { DemoCatalog, normalize } from './catalog.js';
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
  constructor(env = process.env, fetcher = fetch) { super([]); this.env = env; this.fetcher = fetcher; this.live = true; this.syncing = false; this.pages = 0; this.complete = false; this.error = null; }
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
    this.items[this.items.indexOf(p)] = updated;
    return updated;
  }
  async byId(id) {
    const raw = await this.request(`/products/detail?id=${encodeURIComponent(id)}`);
    if (!raw.id || !raw.name) return null;
    const p = mapProduct(raw, true); const existing = this.items.findIndex(x => x.id === p.id);
    if (existing >= 0) this.items[existing] = p; else this.items.push(p);
    return p;
  }
  async sync(maxPages = Number(this.env.EKT_MAX_PAGES || 10)) {
    if (this.syncing) return;
    this.syncing = true;
    try {
      for (let page = 1; page <= maxPages; page++) {
        const data = await this.request(`/products?page=${page}`);
        if (!Array.isArray(data.items)) throw new Error('Unexpected catalog format');
        for (const raw of data.items) if (!this.items.some(x => x.id === raw.id)) this.items.push(mapProduct(raw));
        this.pages = page;
        if (!data.items.length || data.items.length < data.per_page) { this.complete = true; break; }
      }
      this.error = null;
    } catch { this.error = 'Каталог загружен не полностью. Проверьте соединение с ekt.kz.'; }
    finally { this.syncing = false; }
  }
  search(query) {
    const q = normalize(query);
    const exact = this.items.filter(p => q.includes(p.sku.toLowerCase()) || new RegExp(`\\b${p.id}\\b`).test(q) || (p.specs['Артикул производителя'] && q.includes(p.specs['Артикул производителя'].toLowerCase())));
    return exact.length ? exact.slice(0, 4) : super.search(query);
  }
  alternatives() { return []; } // No verified compatibility mapping has been supplied by the partner.
}
