// One real, bounded AI call through the running server. Never prints credentials.
import { extensionOrigin } from '../server/distribution.js';
const base = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
const headers = { Origin: extensionOrigin, 'Content-Type': 'application/json' };
const session = await fetch(base + '/api/session', { method: 'POST', headers });
if (!session.ok) throw Error(`Session HTTP ${session.status}`);
headers.Authorization = `Bearer ${(await session.json()).token}`;
try {
  const start = Date.now();
  const response = await fetch(base + '/api/chat', { method: 'POST', headers, body: JSON.stringify({ message: 'Привет!' }), signal: AbortSignal.timeout(40000) });
  const reply = await response.json();
  console.log(JSON.stringify({ status: response.status, mode: reply.answerMode, aiStatus: reply.aiStatus, answer: reply.text, milliseconds: Date.now() - start }));
  if (!response.ok || reply.answerMode !== 'assistant-ai') process.exitCode = 1;
} finally { await fetch(base + '/api/session', { method: 'DELETE', headers }); }
