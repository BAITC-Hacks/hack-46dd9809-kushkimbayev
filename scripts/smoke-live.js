// Read-only live API check followed by a mutation of the LOCAL demo cart only.
const base = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
let token;
async function call(route, method = 'GET', data) {
  const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const result = await r.json(); if (!r.ok) throw Error(result.error); return result;
}
token = (await call('/api/session', 'POST')).token;
try {
  const info = await call('/api/chat', 'POST', { message: '515291' });
  if (info.products[0]?.id !== 515291) throw Error('Wrong product');
  const p = info.products[0]; console.log(JSON.stringify({ id: p.id, price: p.price, stock: p.stock, warning: Boolean(p.warning), warehouses: p.warehouses.filter(w => w.stock > 0).length }));
  const prepared = await call('/api/cart/prepare', 'POST', { sku: p.sku, quantity: p.minOrder });
  if ((await call('/api/cart')).items.length) throw Error('Cart changed before confirmation');
  const confirmed = await call('/api/cart/confirm', 'POST', { proposalId: prepared.proposal.id, confirmed: true });
  if (confirmed.cart.items[0].quantity !== p.minOrder) throw Error('Invalid quantity');
  const retry = await call('/api/cart/confirm', 'POST', { proposalId: prepared.proposal.id, confirmed: true });
  if (retry.cart.items[0].quantity !== p.minOrder) throw Error('Duplicate added');
  console.log('Live catalog + local demo cart confirmation + idempotency: OK');
} finally { await call('/api/session', 'DELETE'); }
