const extension = location.protocol === 'chrome-extension:';
const messages = document.querySelector('#messages'), form = document.querySelector('#composer'), input = document.querySelector('#message');
let serverURL = location.origin, busy = false, selectedFile = null, pendingButtons = [];
const money = value => value == null ? 'Цена не указана' : `${Number(value).toLocaleString('ru-RU')} ₸`;
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const scroll = () => { messages.scrollTop = messages.scrollHeight; };
async function api(path, method = 'GET', body) {
  if (extension) {
    const result = await chrome.runtime.sendMessage({ type: 'api', path, method, body });
    if (!result || result.error) throw Error(result?.error || 'Не удалось связаться с расширением.');
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
  if (role === 'assistant') el.append(node('div', 'message-label', '✦ EKT АССИСТЕНТ'));
  el.append(node('div', 'bubble', text)); messages.append(el); scroll(); return el;
}
function safeLink(url, label, cls = '') {
  const u = new URL(url, serverURL);
  if (!['http:', 'https:'].includes(u.protocol)) return node('span', '', label);
  const a = node('a', cls, label); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function renderProduct(p) {
  const card = node('section', 'product-card'), top = node('div', 'product-top'), copy = node('div');
  if (p.image) { const image = node('img', 'product-image'); image.src = p.image; image.alt = ''; image.loading = 'lazy'; top.append(image); }
  copy.append(node('div', 'sku', `АРТ. ${p.sku}`), node('h3', '', p.name)); top.append(copy); card.append(top);
  const stock = p.stockKnown === false ? null : p.stock ?? p.warehouses.reduce((n, w) => n + w.stock, 0);
  card.append(node('div', `stock ${stock === 0 ? 'empty' : ''}`, stock === null ? 'Наличие уточняется в карточке' : stock > 0 ? `● В наличии · ${stock} ${p.unit}` : 'Нет в наличии'));
  const price = node('div', 'product-price', money(p.price)); price.append(node('small', '', ` / ${p.unit}`)); card.append(price);
  if (p.warning) card.append(node('div', 'warning', p.warning));
  if (p.reason) card.append(node('div', 'reason', `Почему этот аналог: ${p.reason}`));
  const details = node('details'); details.append(node('summary', '', 'Характеристики и наличие по складам'));
  const dl = node('dl'); for (const [k, v] of Object.entries(p.specs)) dl.append(node('dt', '', k), node('dd', '', v));
  details.append(dl);
  if (!Object.keys(p.specs).length) details.append(node('p', '', 'Характеристики не переданы источником.'));
  for (const w of p.warehouses.filter(w => w.stock > 0)) details.append(node('div', '', `${w.name}: ${w.stock} ${p.unit}`));
  if (p.description) details.append(node('p', '', p.description));
  if (p.checkedAt) details.append(node('p', '', `Проверено: ${new Date(p.checkedAt).toLocaleTimeString('ru-RU')}`));
  card.append(details);
  if (!p.certificates.length) card.append(node('div', 'sku', 'Сертификат не передан источником'));
  for (const c of p.certificates) card.append(safeLink(c.url, `↗ ${c.name}`));
  if (p.url) card.append(safeLink(p.url, 'Открыть товар на ekt.kz ↗'));
  const actions = node('div', 'product-actions');
  const qty = node('input', 'quantity'); qty.type = 'number'; qty.min = p.minOrder; qty.max = stock ?? 10000; qty.step = 1; qty.value = p.minOrder; qty.setAttribute('aria-label', `Количество ${p.sku}`);
  const add = node('button', 'primary', stock === null ? 'Уточнить товар' : 'В демо-корзину'); add.type = 'button'; add.disabled = stock === 0 || p.price === null;
  add.onclick = () => stock === null ? send(`Покажи товар ${p.id}`) : act(async () => render(await api('/api/cart/prepare', 'POST', { sku: p.sku, quantity: Number(qty.value) })));
  actions.append(qty, add); card.append(actions); return card;
}
function invalidate() { for (const b of pendingButtons) b.disabled = true; pendingButtons = []; }
// Integration point: replace this alert with the site's authenticated cart function.
// Called only after the server has accepted an explicit confirmation and rechecked stock.
function notifyCartChange(result) {
  window.alert(`Товар добавлен в корзину!\n\n${result.text}\n\nПрототип: изменение корзины ekt.kz сейчас имитируется.`);
}
function render(result) {
  invalidate(); const el = message(result.text);
  for (const p of [...(result.products || []), ...(result.alternatives || [])]) el.append(renderProduct(p));
  for (const source of result.sources || []) el.append(safeLink(source.url, `Источник: ${source.title}`));
  if (result.proposal) {
    const area = node('div', 'confirmation'); area.append(node('div', 'sku', 'ПОДТВЕРЖДЕНИЕ · ДЕЙСТВУЕТ 5 МИНУТ'));
    const confirm = node('button', 'primary', 'Да, добавь'), cancel = node('button', 'secondary', 'Отмена');
    confirm.onclick = () => act(async () => render(await api('/api/cart/confirm', 'POST', { proposalId: result.proposal.id, confirmed: true })));
    cancel.onclick = () => send('Отмена'); area.append(confirm, cancel); el.append(area); pendingButtons = [confirm, cancel];
  }
  if (result.cartPath) { el.append(safeLink(result.cartPath, 'Открыть демонстрационную корзину ↗', 'cart-link')); notifyCartChange(result); }
  scroll();
}
async function act(fn) {
  if (busy) return; busy = true; document.querySelector('#send').disabled = true; input.disabled = true;
  const typing = node('div', 'typing', 'Проверяю данные'); messages.append(typing); scroll();
  try { await fn(); } catch (e) { message(e.message || 'Не удалось подключиться к серверу. Проверьте, что он запущен.', 'error'); }
  finally { typing.remove(); busy = false; document.querySelector('#send').disabled = false; input.disabled = false; input.focus(); scroll(); }
}
async function send(text) {
  if (busy || (!text.trim() && !selectedFile)) return;
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
document.querySelector('#reset').onclick = () => act(async () => { await api('/api/session', 'DELETE'); messages.replaceChildren(); invalidate(); message('Начат новый диалог. Предыдущая сессия и демонстрационная корзина удалены.'); });
api('/api/health').then(data => {
  document.querySelector('#connection').textContent = data.ai ? 'На связи · ИИ подключён' : 'На связи · поиск по каталогу';
  document.querySelector('#mode-note').textContent = `${data.mode === 'live' ? 'Каталог ekt.kz · реальные данные' : 'Тестовый каталог'} · корзина демонстрационная`;
  if (data.mode === 'demo') document.querySelector('[data-query="Покажи товар 515291"]').dataset.query = 'Покажи DEMO-101';
  if (data.mode === 'live') { const b = document.querySelector('[data-query="Нужен аналог DEMO-102"]'); b.dataset.query = 'Нужен аналог товара 515291'; }
}).catch(() => { document.querySelector('#connection').textContent = 'Нет соединения'; document.querySelector('#mode-note').textContent = 'Запустите сервер или проверьте адрес в настройках расширения'; });
