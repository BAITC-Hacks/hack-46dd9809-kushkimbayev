// Read-only live catalog check and confirmed simulated alert action; no cart mutations.
import { extensionOrigin } from '../server/distribution.js';
const base = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
let token;
async function call(route, method = 'GET', data) {
  const r = await fetch(base + route, { method, headers: { Origin: extensionOrigin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await r.json(); if (!r.ok) throw Error(result.error); return result;
}
token = (await call('/api/session', 'POST')).token;
try {
  const info = await call('/api/chat', 'POST', { message: 'Есть товар 515291?' });
  if (info.products[0]?.id !== 515291) throw Error('Wrong product');
  const p = info.products[0]; console.log(JSON.stringify({ id: p.id, price: p.price, stock: p.stock, warning: Boolean(p.warning), warehouses: p.warehouses.filter(w => w.stock > 0).length }));
  const prepared = await call('/api/cart/prepare', 'POST', { sku: p.sku, quantity: p.minOrder });
  if (!prepared.proposal || prepared.action) throw Error('Action occurred before confirmation');
  const confirmed = await call('/api/cart/confirm', 'POST', { proposalId: prepared.proposal.id, confirmed: true });
  if (confirmed.action.quantity !== p.minOrder || confirmed.cart) throw Error('Invalid action');
  const retry = await call('/api/cart/confirm', 'POST', { proposalId: prepared.proposal.id, confirmed: true });
  if (retry.action.id !== confirmed.action.id) throw Error('Duplicate action');
  for (const query of ['Витая пара', 'Кабель телефонный']) {
    const found = await call('/api/chat', 'POST', { message: query });
    if (!found.products?.length) throw Error(`No matches: ${query}`);
    console.log(JSON.stringify({ query, matches: found.products.map(p => ({ id: p.id, name: p.name, stock: p.stock })) }));
  }
  console.log('Live name search + confirmation alert action + idempotency: OK');
} finally { await call('/api/session', 'DELETE'); }
