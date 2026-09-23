const base = process.env.EKT_API_BASE;
const headers = { Authorization: `Basic ${Buffer.from(`${process.env.EKT_API_USER}:${process.env.EKT_API_PASSWORD}`).toString('base64')}` };
const paths = ['/products?search=' + encodeURIComponent('Витая пара'), '/products?q=' + encodeURIComponent('Кабель телефонный'), '/products?per_page=500&page=1', '/products?page=1000'];
const results = await Promise.all(paths.map(async path => {
  const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(20000) }); const data = await r.json();
  return { path, status: r.status, page: data.page, per_page: data.per_page, count: data.count, keys: Object.keys(data), sample: data.items?.slice(0, 3).map(p => ({ id: p.id, name: p.name })) };
}));
console.log(JSON.stringify(results, null, 2));
