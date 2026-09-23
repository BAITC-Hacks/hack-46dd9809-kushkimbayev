import { LiveCatalog } from '../server/live-catalog.js';
const catalog = new LiveCatalog();
await catalog.sync();
if (!catalog.complete || catalog.error) process.exitCode = 1;
for (const query of ['Витая пара', 'Кабель телефонный']) console.log(JSON.stringify({ query, matches: catalog.search(query).map(p => ({ id: p.id, name: p.name })) }));
