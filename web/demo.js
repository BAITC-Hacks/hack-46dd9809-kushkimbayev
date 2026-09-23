const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
async function load(query = '') {
  try {
    const r = await fetch(`/api/catalog${query ? `?q=${encodeURIComponent(query)}` : ''}`); if (!r.ok) throw Error(); const data = await r.json();
    const area = document.querySelector('#products'); area.replaceChildren();
    document.querySelector('#catalog-count').textContent = `${data.products.length} позиций в подборке`;
    document.querySelector('#source-label').textContent = data.mode === 'live' ? '● API ekt.kz' : '● Тестовые данные';
    document.querySelector('#catalog-note').textContent = data.mode === 'live' ? 'Показана часть каталога. Актуальное наличие и характеристики проверяются при запросе в чате. Корзина в прототипе демонстрационная.' : 'Демонстрационные товары, цены и остатки. Данные не являются предложением ekt.kz.';
    for (const p of data.products.slice(0, 9)) {
      const card = el('article', 'catalog-card'), visual = el('div', 'product-visual');
      if (p.image) { const img = el('img'); img.src = p.image; img.alt = ''; img.loading = 'lazy'; visual.append(img); } else visual.append(el('span', 'symbol', p.category === 'Кабель' ? '◎' : '▥'));
      const a = el('a', '', p.url ? 'Подробнее на ekt.kz ↗' : 'Спросите в чате →'); a.href = p.url || '#about'; if (p.url) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      card.append(visual, el('div', 'sku', `АРТ. ${p.sku}`), el('h3', '', p.name), el('div', 'stock', p.stockKnown === false ? 'Наличие — по запросу в чате' : `Остаток: ${p.stock ?? p.warehouses.reduce((n, w) => n + w.stock, 0)} ${p.unit}`), el('div', 'price', p.price === null ? 'Цена не указана' : `${p.price.toLocaleString('ru-RU')} ₸`), a); area.append(card);
    }
    if (!data.products.length) area.append(el('p', '', 'Пока нет совпадений. Попробуйте запросить ID товара в чате.'));
  } catch { document.querySelector('#catalog-count').textContent = 'Нет соединения с сервером'; }
}
document.querySelector('#search').onsubmit = e => { e.preventDefault(); load(document.querySelector('#query').value); };
load();
setTimeout(() => { if (!document.querySelector('.catalog-card')) load(); }, 5000);
