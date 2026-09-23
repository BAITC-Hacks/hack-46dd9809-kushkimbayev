const token = location.hash.slice(1);
async function load() {
  const area = document.querySelector('#cart-items');
  try {
    const r = await fetch('/api/cart/view', { headers: { Authorization: `Bearer ${token}` } }); const data = await r.json(); if (!r.ok) throw Error(data.error);
    area.replaceChildren();
    for (const p of data.items) {
      const row = document.createElement('div'); row.className = 'cart-row'; const description = document.createElement('div'), title = document.createElement('h3'), detail = document.createElement('p'), price = document.createElement('strong');
      title.textContent = p.name; detail.textContent = `${p.sku} · ${p.quantity} ${p.unit} × ${p.price.toLocaleString('ru-RU')} ₸`; price.textContent = `${(p.price * p.quantity).toLocaleString('ru-RU')} ₸`;
      description.append(title, detail); row.append(description, price); area.append(row);
    }
    if (!data.items.length) area.textContent = 'В корзине пока нет товаров.';
    document.querySelector('#total').textContent = `Итого: ${data.total.toLocaleString('ru-RU')} ₸`;
  } catch (e) { area.textContent = e.message; }
}
load(); window.addEventListener('focus', load);
