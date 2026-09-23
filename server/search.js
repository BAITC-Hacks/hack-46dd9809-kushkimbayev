const fold = value => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/×/g, 'x');
export const normalizeExact = value => fold(value).replace(/&(?:quot|amp|nbsp|apos|lt|gt);/g, entity => ({ '&quot;': '"', '&amp;': '&', '&nbsp;': ' ', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[entity]).replace(/\s+/gu, ' ').trim();
export function exactProductMatch(items, query) {
  const q = normalizeExact(query).replace(/^(?:открой|покажи)(?:\s+(?:товар|карточку))?\s+/u, '').replace(/^(?:артикул|код(?: товара)?|id)\s*[:#№=]?\s*/u, '').trim();
  if (!q) return null;
  const byCode = items.filter(p => [p.sku, p.id, p.specs?.['Артикул производителя']].some(value => value != null && normalizeExact(value) === q));
  if (byCode.length) return { kind: 'code', products: byCode };
  const byName = items.filter(p => normalizeExact(p.name) === q);
  return byName.length ? { kind: 'name', products: byName } : null;
}
const stop = new Set('мне нужен нужна нужно нужны покажи найти найди ищу хочу есть наличии наличие товар товары пожалуйста сколько стоит цена купить добавь добавьте корзину штуки штук шт метров метр характеристики сертификат про для что какой какая какие этот это его ли по на в и с'.split(' '));
const stem = word => word.length > 4 ? word.replace(/(иями|ами|ого|ему|ому|ыми|ими|ий|ый|ая|яя|ое|ее|ые|ие|ой|ей|ов|ев|ам|ям|ах|ях|ом|ем|ы|и|а|я|у|ю|е)$/u, '') : word;
export function searchProducts(items, query, limit = 4) {
  const q = fold(query).trim();
  if (!q) return [];
  const numericIds = new Set(q.match(/(?<![\p{L}\d_-])\d+(?![\p{L}\d_-])/gu) || []);
  const containsIdentifier = value => {
    const identifier = fold(value); if (!identifier) return false;
    let position = q.indexOf(identifier);
    while (position >= 0) {
      const before = q[position - 1] || ' ', after = q[position + identifier.length] || ' ';
      if (!/[\p{L}\d]/u.test(before) && !/[\p{L}\d]/u.test(after)) return true;
      position = q.indexOf(identifier, position + 1);
    }
    return false;
  };
  const exact = items.filter(p => numericIds.has(String(p.id)) || containsIdentifier(p.sku) || containsIdentifier(p.specs?.['Артикул производителя']));
  if (exact.length) return exact.slice(0, limit);
  if (/demo-\d+/i.test(q)) return [];
  let remaining = q;
  const groups = [];
  if (/вит\p{L}*\s+пар\p{L}*/u.test(q)) {
    groups.push(text => /вит\p{L}*\s+пар|\b(?:[su]?ftp|utp|u\/utp|f\/utp)\b/iu.test(text) && !/розетк|коннектор|патч.?панел|инстр|тестер/iu.test(text));
    remaining = remaining.replace(/вит\p{L}*\s+пар\p{L}*/gu, '');
  }
  if (/телефон\p{L}*/u.test(q) && !/розет|роз\.|механизм|аппарат/iu.test(q)) {
    groups.push(text => ((/телефон/iu.test(text) && /кабел|провод|шнур/iu.test(text)) || /(?<!\p{L})(?:тппэп\p{L}*|трп|штлп)(?!\p{L})/iu.test(text)) && !/розет|(?:^|\s)роз\.|механизм|коннектор|адаптер|аппарат/iu.test(text));
    remaining = remaining.replace(/телефон\p{L}*|кабел\p{L}*/gu, '');
  }
  const words = (remaining.match(/[\p{L}\d]+/gu) || []).filter(w => w.length > 1 && !stop.has(w));
  for (const word of words) {
    const root = stem(word);
    groups.push(text => text.includes(root));
  }
  if (!groups.length) return [];
  return items.map(p => {
    const name = fold(p.name), text = fold(`${p.name} ${p.category} ${p.brand} ${Object.values(p.specs || {}).join(' ')}`);
    if (!groups.every(matches => matches(text))) return null;
    return { p, score: (name.includes(q) ? 100 : 0) + groups.filter(matches => matches(name)).length * 5 + (p.stock > 0 ? 1 : 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'ru')).slice(0, limit).map(x => x.p);
}
