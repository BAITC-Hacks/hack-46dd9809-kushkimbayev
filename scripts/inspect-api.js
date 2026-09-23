const headers = { Authorization: `Basic ${Buffer.from(`${process.env.EKT_API_USER}:${process.env.EKT_API_PASSWORD}`).toString('base64')}` };
for (const endpoint of ['/products', '/products/detail?id=515291']) {
  const response = await fetch(`${process.env.EKT_API_BASE}${endpoint}`, { headers, signal: AbortSignal.timeout(20000) });
  console.log(endpoint, response.status);
  const json = await response.json();
  console.log(JSON.stringify(json, null, 2).slice(0, 14000));
}
