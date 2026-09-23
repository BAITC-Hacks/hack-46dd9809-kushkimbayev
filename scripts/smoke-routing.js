// One bounded paid research request at most. Product checks never invoke OpenAI.
import { extensionOrigin } from '../server/distribution.js';
const base = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
const token = (await (await fetch(base + '/api/session', { method: 'POST', headers: { Origin: extensionOrigin } })).json()).token;
async function chat(message) {
  const r = await fetch(base + '/api/chat', { method: 'POST', headers: { Origin: extensionOrigin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ message }) });
  const result = await r.json(); if (!r.ok) throw Error(result.error); return result;
}
try {
  const exact = await chat('200300285_');
  if (exact.matchType !== 'exact' || !exact.navigation?.url.startsWith('https://ekt.kz/catalog/')) throw Error('Exact SKU did not navigate');
  const name = await chat(exact.navigation.name);
  if (name.navigation?.url !== exact.navigation.url) throw Error('Exact name did not navigate');
  const partial = await chat('Кабель телефонный');
  if (partial.navigation || !partial.products.length) throw Error('Partial search did not return products');
  console.log(JSON.stringify({ exactSku: exact.matchType, exactName: name.matchType, partialMatches: partial.products.length }));
  if (process.argv.includes('--ai')) {
    const researched = await chat('Что такое EKT PRO?');
    console.log(JSON.stringify({ mode: researched.answerMode, status: researched.aiStatus, answer: researched.text, sources: researched.sources }));
    if (researched.answerMode !== 'research-ai') process.exitCode = 1;
  }
} finally { await fetch(base + '/api/session', { method: 'DELETE', headers: { Origin: extensionOrigin, Authorization: `Bearer ${token}` } }); }
