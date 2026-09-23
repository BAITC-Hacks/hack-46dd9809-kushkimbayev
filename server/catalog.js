const product = (sku, name, category, price, stock, specs, extra = {}) => ({
  sku, name, category, price, currency: 'KZT', unit: 'шт.', minOrder: 1,
  warehouses: [{ name: 'Алматы · демо', stock }], specs, certificates: [], ...extra,
});
// Entirely synthetic fixtures, not an export of ekt.kz.
export const products = [
  product('DEMO-101', 'Автоматический выключатель C16 · 1P', 'Автоматы', 1890, 48, { 'Полюса': '1P', 'Номинальный ток': '16 А', 'Характеристика': 'C', 'Отключающая способность': '6 кА', 'Напряжение': '230 В' }, { brand: 'Demo Electric', compatibility: 'mcb-1p-c16-6ka', certificates: [{ name: 'Образец документа (не сертификат)', url: '/sample-certificate.html' }] }),
  product('DEMO-102', 'Автоматический выключатель C16 · 1P, серия Pro', 'Автоматы', 2350, 0, { 'Полюса': '1P', 'Номинальный ток': '16 А', 'Характеристика': 'C', 'Отключающая способность': '6 кА', 'Напряжение': '230 В' }, { brand: 'Demo Pro', compatibility: 'mcb-1p-c16-6ka' }),
  product('DEMO-103', 'Автоматический выключатель C25 · 1P', 'Автоматы', 2100, 32, { 'Полюса': '1P', 'Номинальный ток': '25 А', 'Характеристика': 'C', 'Отключающая способность': '6 кА' }, { brand: 'Demo Electric', compatibility: 'mcb-1p-c25-6ka' }),
  product('DEMO-201', 'Кабель ВВГнг-LS 3×2,5', 'Кабель', 720, 250, { 'Жилы': '3', 'Сечение': '2,5 мм²', 'Материал': 'Медь', 'Исполнение': 'нг-LS' }, { brand: 'Demo Cable', unit: 'м', minOrder: 5, compatibility: 'copper-3x2.5-ls' }),
  product('DEMO-202', 'Кабель ВВГнг-LS 3×1,5', 'Кабель', 490, 180, { 'Жилы': '3', 'Сечение': '1,5 мм²', 'Материал': 'Медь', 'Исполнение': 'нг-LS' }, { brand: 'Demo Cable', unit: 'м', minOrder: 5, compatibility: 'copper-3x1.5-ls' }),
  product('DEMO-301', 'Розетка с заземлением · белая', 'Розетки', 1450, 64, { 'Номинальный ток': '16 А', 'Защита': 'IP20', 'Монтаж': 'Скрытый', 'Цвет': 'Белый' }, { brand: 'Demo Home', compatibility: 'socket-earthed-ip20' }),
  product('DEMO-401', 'Светодиодная лампа E27 · 10 Вт', 'Освещение', 890, 120, { 'Цоколь': 'E27', 'Мощность': '10 Вт', 'Температура': '4000 K', 'Световой поток': '900 лм' }, { brand: 'Demo Light', compatibility: 'e27-10w-4000k' }),
  product('DEMO-501', 'УЗО 2P · 40 А · 30 мА', 'Защита', 12400, 12, { 'Полюса': '2P', 'Номинальный ток': '40 А', 'Ток утечки': '30 мА', 'Тип': 'A' }, { brand: 'Demo Electric', compatibility: 'rcd-2p-40a-30ma-a' }),
];
export const conditions = 'Демонстрационные условия, не оферта ekt.kz. Оплата: в тестовом сценарии предусмотрены безналичный расчёт и карта при оформлении; платежи здесь не принимаются. Доставка: самовывоз или доставка по согласованию; стоимость и срок уточняет менеджер. Минимальная партия: 1 шт. для штучного товара, 5 м для кабеля. Реальные условия необходимо получить от партнёра.';
export const stockOf = p => p.stockKnown === false ? null : p.stock ?? p.warehouses.reduce((n, w) => n + w.stock, 0);
export const normalize = s => s.toLowerCase().replace(/ё/g, 'е').replace(/×/g, 'x');
export class DemoCatalog {
  constructor(items = structuredClone(products)) { this.items = items; }
  get(sku) { return this.items.find(p => p.sku === sku); }
  search(query) {
    const q = normalize(query);
    const exact = this.items.filter(p => q.includes(p.sku.toLowerCase()));
    if (exact.length) return exact;
    if (/demo-\d+/i.test(q)) return [];
    const tokens = q.match(/[\p{L}\d]+/gu)?.filter(x => x.length > 2) ?? [];
    return this.items.map(p => ({ p, score: tokens.reduce((n, t) => n + (normalize(`${p.name} ${p.category} ${p.brand} ${Object.values(p.specs).join(' ')}`).includes(t) ? 1 : 0), 0) }))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(x => x.p);
  }
  alternatives(p) {
    return this.items.filter(x => x.sku !== p.sku && x.compatibility === p.compatibility && stockOf(x) > 0)
      .map(x => ({ ...x, reason: `Совпадают параметры: ${Object.entries(p.specs).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ')}. Совместимость с конкретной установкой должен проверить специалист.` }));
  }
}
