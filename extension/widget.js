const extension = location.protocol === 'chrome-extension:';
if (location.search === '?embedded=1') document.documentElement.classList.add('embedded');
const messages = document.querySelector('#messages'), form = document.querySelector('#composer'), input = document.querySelector('#message');
let serverURL = location.origin, busy = false, selectedFile = null, pendingButtons = [], extensionDisconnected = false;
const money = value => value == null ? 'Цена не указана' : `${Number(value).toLocaleString('ru-RU')} ₸`;
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const scroll = () => { messages.scrollTop = messages.scrollHeight; };
function disconnectExtension() {
  if (!extensionDisconnected) {
    extensionDisconnected = true;
    invalidate();
    document.querySelector('#connection').textContent = 'Расширение отключилось';
    document.querySelector('#connection').setAttribute('data-state', 'disconnected');
    document.querySelector('#mode-note').textContent = 'Перезапустите чат; если не помогло — обновите страницу ekt.kz (F5).';
    input.disabled = true;
    document.querySelector('#send').disabled = true;
    document.querySelectorAll('#reset, #file, [data-query], .product-actions button, .product-actions input, .confirmation button').forEach(el => { el.disabled = true; });
    const el = message('Связь с расширением потеряна. Такое бывает после его обновления или отключения. Перезапустите чат. Если ошибка повторится, проверьте, что расширение включено, и обновите страницу ekt.kz (F5). Последний запрос не отправляется повторно автоматически.', 'error');
    el.id = 'extension-recovery';
    const restart = node('button', 'secondary', 'Перезапустить чат');
    restart.type = 'button';
    // Reload only this widget; never replay a request or a cart confirmation.
    restart.onclick = () => { restart.disabled = true; location.reload(); };
    el.append(restart); scroll();
  }
  return Error('Связь с расширением потеряна. Перезапустите чат или обновите страницу ekt.kz (F5).');
}
async function api(path, method = 'GET', body) {
  if (extension) {
    if (extensionDisconnected) throw disconnectExtension();
    let result;
    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.id || typeof runtime.sendMessage !== 'function') throw Error('Extension context invalidated.');
      result = await runtime.sendMessage({ type: 'api', path, method, body });
    } catch (error) {
      if (/extension context invalidated|receiving end does not exist|could not establish connection|message (?:port|channel) closed/i.test(error?.message || '')) throw disconnectExtension();
      throw error;
    }
    if (extensionDisconnected || !result || (!result.error && result.data == null)) throw disconnectExtension();
    if (result.error) throw Error(result.error);
    serverURL = result.serverURL; return result.data;
  }
  let token = sessionStorage.getItem('ekt-session');
  if (!token && path !== '/api/health') {
    const r = await fetch('/api/session', { method: 'POST' }); const data = await r.json(); if (!r.ok) throw Error(data.error);
    token = data.token; sessionStorage.setItem('ekt-session', token);
  }
  const r = await fetch(path, { method, signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await r.json();
  if (!r.ok) { if (r.status === 401) sessionStorage.removeItem('ekt-session'); throw Error(data.error || 'Сервер недоступен.'); }
  if (method === 'DELETE') sessionStorage.removeItem('ekt-session');
  return data;
}
function message(text, role = 'assistant') {
  document.querySelector('.welcome')?.remove();
  const el = node('article', `message ${role}`);
  if (role === 'assistant') el.append(node('div', 'message-label', 'КОНСУЛЬТАНТ EKT'));
  el.append(node('div', 'bubble', text)); messages.append(el); scroll(); return el;
}
function safeLink(url, label, cls = '') {
  const u = new URL(url, serverURL);
  if (!['http:', 'https:'].includes(u.protocol)) return node('span', '', label);
  const a = node('a', cls, label); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function renderProduct(p) {
  const card = node('section', 'product-card item'), top = node('div', 'product-top'), copy = node('div', 'product-info');
  const photo = node('div', 'product-photo'), fallback = node('span', 'photo-fallback', 'Фото товара недоступно');
  fallback.hidden = Boolean(p.image);
  if (p.image) {
    const image = node('img', 'product-image'); image.src = p.image; image.alt = p.name; image.loading = 'lazy';
    image.onerror = () => { image.hidden = true; fallback.hidden = false; };
    photo.append(image);
  }
  photo.append(fallback);
  const specs = Object.entries(p.specs || {}), warehouses = p.warehouses || [];
  copy.append(node('div', 'item-kicker', p.brand || 'КАТАЛОГ EKT'), node('h3', 'item-title', p.name), node('div', 'sku', `Артикул: ${p.sku}`));
  if (specs.length) {
    const preview = node('dl', 'specs');
    for (const [key, value] of specs.slice(0, 3)) preview.append(node('dt', '', key), node('dd', '', value));
    copy.append(preview);
  }
  if (p.url) copy.append(safeLink(p.url, 'Карточка на ekt.kz ↗', 'product-link'));
  top.append(photo, copy); card.append(top);
  const stock = p.stockKnown === false ? null : p.stock ?? (warehouses.length ? warehouses.reduce((n, w) => n + w.stock, 0) : null);
  const knownPrice = Number.isFinite(p.price) && p.price >= 0;
  const priceRow = node('div', 'price-row'), priceBlock = node('div'), price = node('strong', 'product-price', knownPrice ? money(p.price) : 'Цена не указана');
  if (knownPrice) price.append(node('small', '', ` / ${p.unit}`));
  priceBlock.append(node('div', 'price-label', 'Цена по каталогу'), price); priceRow.append(priceBlock); card.append(priceRow);
  card.append(node('div', `stock ${stock === 0 ? 'empty' : stock === null ? 'unknown' : ''}`, stock === null ? 'Наличие уточняется в карточке' : stock > 0 ? `✓ В наличии · ${stock} ${p.unit}` : 'Нет в наличии'));
  if (p.warning) card.append(node('div', 'warning', p.warning));
  if (p.reason) card.append(node('div', 'reason', `Почему этот аналог: ${p.reason}`));
  const details = node('details'); details.append(node('summary', '', 'Характеристики и наличие по складам'));
  const dl = node('dl'); for (const [k, v] of specs) dl.append(node('dt', '', k), node('dd', '', v));
  details.append(dl);
  if (!specs.length) details.append(node('p', '', 'Характеристики не переданы источником.'));
  for (const w of warehouses.filter(w => w.stock > 0)) details.append(node('div', '', `${w.name}: ${w.stock} ${p.unit}`));
  if (p.description) details.append(node('p', '', p.description));
  if (p.checkedAt) details.append(node('p', '', `Проверено: ${new Date(p.checkedAt).toLocaleTimeString('ru-RU')}`));
  card.append(details);
  const certificates = node('div', 'certificates');
  if (!p.certificates?.length) certificates.append(node('div', 'sku', 'Сертификат не передан источником'));
  for (const c of p.certificates || []) certificates.append(safeLink(c.url, `↗ ${c.name}`, 'certificate-link'));
  card.append(certificates);
  const actions = node('div', 'product-actions');
  const minOrder = p.minOrder || 1;
  const labels = node('div', 'purchase-labels'); labels.append(node('span', '', 'Количество'), node('span', '', 'Сумма'));
  const purchase = node('div', 'purchase'), quantityControl = node('div', 'quantity-control');
  const qty = node('input', 'quantity'); qty.type = 'number'; qty.min = minOrder; qty.max = stock ?? 10000; qty.step = 1; qty.value = minOrder; qty.setAttribute('aria-label', `Количество ${p.sku}`);
  quantityControl.append(qty, node('span', '', p.unit));
  const total = node('strong', 'purchase-total'); total.setAttribute('aria-live', 'polite');
  const add = node('button', 'primary', stock === null ? 'Уточнить товар' : 'В корзину →'); add.type = 'button';
  const updateTotal = () => {
    const quantity = Number(qty.value);
    const valid = Number.isSafeInteger(quantity) && quantity >= minOrder && quantity <= (stock ?? 10000);
    total.textContent = !knownPrice ? 'Цена не указана' : valid ? money(p.price * quantity) : '—';
    add.disabled = extensionDisconnected || (stock !== null && (!knownPrice || !valid));
  };
  qty.oninput = updateTotal; updateTotal();
  add.onclick = () => stock === null ? send(`Покажи товар ${p.id}`) : act(async () => render(await api('/api/cart/prepare', 'POST', { sku: p.sku, quantity: Number(qty.value) })));
  purchase.append(quantityControl, total); actions.append(labels, purchase, add, node('div', 'explain', 'Добавим только после вашего подтверждения')); card.append(actions); return card;
}
function invalidate() { for (const b of pendingButtons) b.disabled = true; pendingButtons = []; }
// Integration point: replace this alert with the site's authenticated cart function.
// Called only after the server has accepted an explicit confirmation and rechecked stock.
const shownActions = new Set();
function notifyCartChange(result) {
  if (shownActions.has(result.action.id)) return;
  shownActions.add(result.action.id);
  window.alert(`Товар добавлен в корзину!\n\n${result.action.name}\nКоличество: ${result.action.quantity} ${result.action.unit}\n\nИмитация действия сайта; реальная корзина не изменяется.`);
}
function render(result) {
  invalidate(); const el = message(result.text);
  if (result.matchType === 'exact' && result.navigation?.type === 'open_product') {
    const url = new URL(result.navigation.url);
    if (url.protocol === 'https:' && url.hostname === 'ekt.kz' && !url.port && !url.username && !url.password && url.pathname.startsWith('/catalog/')) {
      if (!extension) window.open(url.href, '_blank', 'noopener,noreferrer');
      el.append(safeLink(url.href, result.navigation.opened ? 'Товар открыт в новой вкладке ↗' : 'Открыть страницу товара ↗', 'source-link'));
    }
  }
  for (const p of [...(result.products || []), ...(result.alternatives || [])]) el.append(renderProduct(p));
  for (const source of result.sources || []) el.append(safeLink(source.url, `Источник: ${source.title}`, 'source-link'));
  if (result.answerMode === 'research-ai') el.append(node('div', 'sku', `ИИ · на основе research · проверено ${result.knowledgeCheckedAt}`));
  if (result.answerMode === 'assistant-ai') el.append(node('div', 'sku', 'ИИ · общая консультация'));
  if (result.answerMode === 'research-fallback') el.append(node('div', 'sku', 'Справка из research · ИИ недоступен'));
  if (result.proposal) {
    const area = node('div', 'confirmation'); area.append(node('div', 'sku', 'ПОДТВЕРЖДЕНИЕ · ДЕЙСТВУЕТ 5 МИНУТ'));
    const confirm = node('button', 'primary', 'Да, добавь'), cancel = node('button', 'secondary', 'Отмена');
    confirm.onclick = () => act(async () => render(await api('/api/cart/confirm', 'POST', { proposalId: result.proposal.id, confirmed: true })));
    cancel.onclick = () => send('Отмена'); area.append(confirm, cancel); el.append(area); pendingButtons = [confirm, cancel];
  }
  if (result.action?.type === 'add_to_cart') notifyCartChange(result);
  scroll();
}
async function act(fn) {
  if (busy || extensionDisconnected) return; busy = true; document.querySelector('#send').disabled = true; input.disabled = true;
  const typing = node('div', 'typing', 'Проверяю данные'); messages.append(typing); scroll();
  try { await fn(); } catch (e) { if (!extensionDisconnected) message(e.message || 'Не удалось подключиться к серверу. Проверьте, что он запущен.', 'error'); }
  finally { typing.remove(); busy = false; document.querySelector('#send').disabled = extensionDisconnected; input.disabled = extensionDisconnected; if (!extensionDisconnected) input.focus(); scroll(); }
}
async function send(text) {
  if (busy || extensionDisconnected || (!text.trim() && !selectedFile)) return;
  invalidate(); const file = selectedFile; message(text + (file ? `\n📎 ${file.name}` : ''), 'user'); input.value = ''; selectedFile = null; filePreview();
  await act(async () => {
    let attachment;
    if (file) { const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); attachment = { name: file.name, base64 }; }
    render(await api('/api/chat', 'POST', { message: text, ...(attachment ? { attachment } : {}) }));
  });
}
form.onsubmit = e => { e.preventDefault(); send(input.value); };
input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } };
document.querySelectorAll('[data-query]').forEach(b => { b.onclick = () => send(b.dataset.query); });
function filePreview() {
  const area = document.querySelector('#file-preview'); area.replaceChildren(); area.hidden = !selectedFile;
  if (selectedFile) { area.append(node('span', '', `📎 ${selectedFile.name} · файл будет обработан сервером`)); const remove = node('button', '', '×'); remove.setAttribute('aria-label', 'Убрать файл'); remove.onclick = () => { selectedFile = null; filePreview(); }; area.append(remove); }
  document.querySelector('#file').value = '';
}
document.querySelector('#file').onchange = e => { const f = e.target.files[0]; if (f?.size > 5 * 1024 * 1024) { message('Максимальный размер файла — 5 МБ.', 'error'); return; } selectedFile = f; filePreview(); };
document.querySelector('#reset').onclick = () => act(async () => { await api('/api/session', 'DELETE'); messages.replaceChildren(); invalidate(); shownActions.clear(); message('Начат новый диалог.'); });
api('/api/health').then(data => {
  if (extensionDisconnected) return;
  document.querySelector('#connection').textContent = data.ai ? 'На связи · ИИ подключён' : 'На связи · каталог и справка о сайте';
  document.querySelector('#mode-note').textContent = data.mode === 'live' ? `Каталог ekt.kz · ${data.count.toLocaleString('ru-RU')} товаров${data.complete ? '' : ' · обновляется'}` : 'Тестовый каталог';
  if (data.mode === 'demo') document.querySelector('[data-query="Покажи товар 515291"]').dataset.query = 'Покажи DEMO-101';
  if (data.mode === 'live') { const b = document.querySelector('[data-query="Нужен аналог DEMO-102"]'); b.dataset.query = 'Нужен аналог товара 515291'; }
}).catch(() => { if (extensionDisconnected) return; document.querySelector('#connection').textContent = 'Нет соединения'; document.querySelector('#mode-note').textContent = 'Запустите Start-EKT.cmd на этом компьютере и повторите сообщение'; });
