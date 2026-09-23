import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IntentAI } from '../server/ai.js';
import { createSession, Assistant } from '../server/assistant.js';
import { DemoCatalog } from '../server/catalog.js';
test('AI request is bounded, structured, not stored and budgeted before fetch', async t => {
  let calls = 0;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder', AI_DAILY_TOKEN_LIMIT: '24000' }, async (url, options) => {
    calls++; const request = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(request.store, false); assert.equal(request.max_output_tokens, 600); assert.equal(request.text.format.strict, true); assert.ok(!request.tools);
    assert.equal(JSON.parse(fs.readFileSync(ai.file, 'utf8')).requests, 1);
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ intent: 'search', query: 'автомат', quantity: null }) }] }] }) };
  });
  ai.file = path.join(os.tmpdir(), `ekt-ai-test-${randomUUID()}.json`); t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  const session = createSession(); assert.equal((await ai.interpret('нужно защитное устройство', session)).query, 'автомат');
  await assert.rejects(ai.interpret('повтор', session), /AI_LIMIT/); assert.equal(calls, 1);
});
test('known SKU, conditions and confirmation never use a paid model', async () => {
  let calls = 0; const assistant = new Assistant(new DemoCatalog(), { enabled: true, interpret: async () => { calls++; throw Error(); } }); const session = createSession();
  await assistant.chat(session, 'DEMO-101'); await assistant.chat(session, 'Доставка'); await assistant.chat(session, 'добавь DEMO-101 2 шт'); await assistant.chat(session, 'да, добавь'); assert.equal(calls, 0); assert.equal(session.cart['DEMO-101'], 2);
});
test('model instructions cannot directly mutate a cart and failures have fallback', async () => {
  const session = createSession(); const assistant = new Assistant(new DemoCatalog(), { enabled: true, interpret: async () => ({ intent: 'prepare', query: 'DEMO-101', quantity: 2 }) });
  const r = await assistant.chat(session, 'непонятный запрос'); assert.ok(r.proposal); assert.deepEqual(session.cart, {});
  assistant.ai.interpret = async () => { throw Error('AI_LIMIT'); }; const fallback = await assistant.chat(session, 'совсем неизвестное'); assert.match(fallback.text, /лимит/); assert.deepEqual(session.cart, {});
});
