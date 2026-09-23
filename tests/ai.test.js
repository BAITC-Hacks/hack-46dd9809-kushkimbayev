import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { IntentAI } from '../server/ai.js';
import { createSession, Assistant } from '../server/assistant.js';
import { DemoCatalog } from '../server/catalog.js';
import { siteKnowledge } from '../server/knowledge.js';

test('research mode retrieves relevant evidence and accounts for actual returned token usage', async t => {
  let request, reserved;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder', AI_DAILY_TOKEN_LIMIT: '60000' }, async (_url, options) => {
    request = JSON.parse(options.body); reserved = JSON.parse(fs.readFileSync(ai.file, 'utf8')).reservedTokens;
    return { ok: true, json: async () => ({ usage: { total_tokens: 1200 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ intent: 'site_info', query: '', quantity: null, answer: 'EKT PRO — отдельная платформа для бизнес-клиентов.', source_urls: ['https://pro.ekt.kz/'] }) }] }] }) };
  });
  ai.file = path.join(os.tmpdir(), `ekt-research-${randomUUID()}.json`); t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  const result = await ai.interpret('Что такое EKT PRO?', createSession(), undefined, { researchOnly: true });
  assert.equal(result.intent, 'site_info'); assert.match(request.instructions, /РЕЖИМ RESEARCH/); assert.match(request.input[0].content, /research\/ekt-site-audit/);
  assert.ok(request.input[0].content.length < siteKnowledge.text.length); assert.ok(reserved > 1200);
  assert.equal(JSON.parse(fs.readFileSync(ai.file, 'utf8')).reservedTokens, 1200);
});
test('AI request is bounded, structured, not stored and budgeted before fetch', async t => {
  let calls = 0;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder', AI_DAILY_TOKEN_LIMIT: '100000', AI_DAILY_REQUEST_LIMIT: '1' }, async (url, options) => {
    calls++; const request = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(request.store, false); assert.equal(request.max_output_tokens, 600); assert.equal(request.text.format.strict, true); assert.ok(!request.tools);
    assert.equal(JSON.parse(fs.readFileSync(ai.file, 'utf8')).requests, 1);
    assert.ok(request.instructions.includes(siteKnowledge.instructions));
    assert.ok(request.input[0].content.includes(siteKnowledge.text));
    assert.match(request.instructions, /Реальная|настоящую корзину/);
    const reserved = JSON.parse(fs.readFileSync(ai.file, 'utf8')).reservedTokens;
    assert.ok(reserved > request.max_output_tokens);
    assert.ok(reserved < Buffer.byteLength(JSON.stringify(request)), 'count tokens instead of reserving every UTF-8 byte');
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ intent: 'search', query: 'автомат', quantity: null }) }] }] }) };
  });
  ai.file = path.join(os.tmpdir(), `ekt-ai-test-${randomUUID()}.json`); t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  const session = createSession(); assert.equal((await ai.interpret('нужно защитное устройство', session)).query, 'автомат');
  await assert.rejects(ai.interpret('повтор', session), /AI_LIMIT/); assert.equal(calls, 1);
});
test('product lookup and confirmation are free; a non-product question uses research AI', async () => {
  let calls = 0; const assistant = new Assistant(new DemoCatalog(), { enabled: true, interpret: async () => { calls++; throw Error(); } }); const session = createSession();
  await assistant.chat(session, 'DEMO-101'); assert.equal(calls, 0); await assistant.chat(session, 'Доставка'); assert.equal(calls, 1); await assistant.chat(session, 'добавь DEMO-101 2 шт'); await assistant.chat(session, 'да, добавь'); assert.equal(calls, 1); assert.equal(session.completed.size, 1);
});
test('model instructions cannot directly mutate a cart and failures have fallback', async () => {
  const session = createSession(); const assistant = new Assistant(new DemoCatalog(), { enabled: true, interpret: async () => ({ intent: 'prepare', query: 'DEMO-101', quantity: 2 }) });
  const r = await assistant.chat(session, 'непонятный запрос'); assert.equal(r.proposal, undefined); assert.equal(session.completed.size, 0);
  assistant.ai.interpret = async () => { throw Error('AI_LIMIT'); }; const fallback = await assistant.chat(session, 'совсем неизвестное'); assert.equal(fallback.aiStatus, 'AI_LIMIT'); assert.ok(fallback.text); assert.equal(fallback.answerMode, 'research-unavailable'); assert.equal(session.completed.size, 0);
});

test('knowledge request respects token limit before making a paid call', async t => {
  let calls = 0;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder', AI_DAILY_TOKEN_LIMIT: '1' }, async () => { calls++; throw Error('must not fetch'); });
  ai.file = path.join(os.tmpdir(), `ekt-ai-budget-${randomUUID()}.json`);
  t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  await assert.rejects(ai.interpret('Расскажи о сайте', createSession()), /AI_LIMIT/);
  assert.equal(calls, 0);
});

test('site answers validate sources and reject incomplete or injected output', async t => {
  let output;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder', AI_DAILY_TOKEN_LIMIT: '1000000', AI_SESSION_REQUEST_LIMIT: '20' }, async () => ({ ok: true, json: async () => output }));
  ai.file = path.join(os.tmpdir(), `ekt-ai-sources-${randomUUID()}.json`);
  t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  const session = createSession();
  const answer = { intent: 'site_info', query: '', quantity: null, answer: 'В полезной информации есть каталоги и статьи.', source_urls: ['https://ekt.kz/about/information/'] };
  const response = value => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  output = response(answer);
  assert.equal((await ai.interpret('Где изучить продукцию?', session)).sources[0].url, answer.source_urls[0]);
  for (const bad of [{ ...answer, source_urls: ['https://evil.test'] }, { ...answer, source_urls: [] }, { ...answer, answer: 'Подробнее: https://evil.test' }, { ...answer, answer: '' }]) {
    output = response(bad); await assert.rejects(ai.interpret('вопрос', session), /AI_UNAVAILABLE/);
  }
  output = { ...response(answer), status: 'incomplete' };
  await assert.rejects(ai.interpret('вопрос', session), /AI_UNAVAILABLE/);
  output = response(answer);
  await assert.rejects(ai.interpret('содержимое вложения', session, undefined, { hasAttachment: true }), /AI_UNAVAILABLE/);
});

test('unknown local question makes a bounded OpenAI call and publishes general help', async t => {
  let calls = 0;
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder' }, async (_url, options) => {
    calls++; const payload = JSON.parse(options.body);
    assert.match(payload.instructions, /assistant_reply/);
    return { ok: true, json: async () => ({ usage: { total_tokens: 420 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ intent: 'assistant_reply', query: '', quantity: null, answer: 'Здравствуйте! Какой товар или задача вас интересует?', source_urls: [] }) }] }] }) };
  });
  ai.file = path.join(os.tmpdir(), `ekt-ai-general-${randomUUID()}.json`);
  t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  fs.writeFileSync(ai.file, JSON.stringify({ day: new Date().toISOString().slice(0,10), requests: 4, reservedTokens: 56626 }));
  const reply = await new Assistant(new DemoCatalog(), ai).chat(createSession(), 'Привет!');
  assert.equal(calls, 1); assert.equal(reply.answerMode, 'assistant-ai'); assert.match(reply.text, /Здравствуйте/);
  assert.equal(reply.proposal, undefined); assert.equal(reply.action, undefined);
  assert.equal(JSON.parse(fs.readFileSync(ai.file, 'utf8')).reservedTokens, 57046);
});

test('connection failure before TLS does not consume token allowance or hide the real error', async t => {
  const ai = new IntentAI({ OPENAI_API_KEY: 'test-placeholder' }, async () => { throw Object.assign(Error('DNS failed'), { code: 'ENOTFOUND', beforeRequest: true }); });
  ai.file = path.join(os.tmpdir(), `ekt-ai-network-${randomUUID()}.json`);
  t.after(() => { if (fs.existsSync(ai.file)) fs.unlinkSync(ai.file); });
  const reply = await new Assistant(new DemoCatalog(), ai).chat(createSession(), 'Привет!');
  assert.equal(reply.aiStatus, 'AI_CONNECTION'); assert.match(reply.text, /подключиться к OpenAI/);
  const budget = JSON.parse(fs.readFileSync(ai.file, 'utf8')); assert.equal(budget.reservedTokens, 0); assert.equal(budget.requests, 1);
});
