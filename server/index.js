import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DemoCatalog } from './catalog.js';
import { LiveCatalog } from './live-catalog.js';
import { IntentAI } from './ai.js';
import { Assistant, AppError, createSession } from './assistant.js';
import { extractAttachment } from './uploads.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createApp({ env = process.env, catalog = env.DATA_MODE === 'live' ? new LiveCatalog(env) : new DemoCatalog(), ai = new IntentAI(env) } = {}) {
  const assistant = new Assistant(catalog, ai), sessions = new Map(), rates = new Map();
  const base = env.PUBLIC_BASE_URL || 'http://localhost:8787';
  const origins = new Set([new URL(base).origin, 'http://localhost:8787', 'http://127.0.0.1:8787', ...(env.EXTENSION_ORIGINS || '').split(',').filter(Boolean)]);
  const cleanup = () => { for (const [k, s] of sessions) if (s.expires < Date.now()) sessions.delete(k); for (const [k, r] of rates) if (r.until < Date.now()) rates.delete(k); };
  const timer = setInterval(cleanup, 60000); timer.unref();
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(415, 'Ожидается JSON.');
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 7 * 1024 * 1024) throw new AppError(413, 'Максимум 5 МБ на файл.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(400, 'Некорректный JSON.'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, base);
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && !origins.has(origin)) throw new AppError(403, 'Источник не разрешён. Добавьте ID расширения в EXTENSION_ORIGINS на сервере.');
        if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
        if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.writeHead(204); return res.end(); }
        const ip = req.socket.remoteAddress;
        if (!rates.has(ip) || rates.get(ip).until < Date.now()) rates.set(ip, { count: 0, until: Date.now() + 60000 });
        if (++rates.get(ip).count > 90) throw new AppError(429, 'Слишком много запросов. Повторите через минуту.');
        if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, mode: catalog.live ? 'live' : 'demo', ai: ai.enabled, cartMode: 'demo', count: catalog.items.length, pages: catalog.pages, complete: catalog.complete, syncing: catalog.syncing, catalogError: catalog.error });
        if (url.pathname === '/api/catalog' && req.method === 'GET') return json(res, 200, { products: (url.searchParams.has('q') ? catalog.search(url.searchParams.get('q').slice(0, 200)) : catalog.items.slice(0, 24)), mode: catalog.live ? 'live' : 'demo' });
        if (url.pathname === '/api/session' && req.method === 'POST') {
          cleanup(); if (sessions.size >= 1000) throw new AppError(503, 'Сервер занят.');
          const s = createSession(); sessions.set(s.id, s); return json(res, 201, { token: s.id, expires: s.expires });
        }
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (url.pathname === '/api/cart/view' && req.method === 'GET') {
          const s = [...sessions.values()].find(x => x.readToken === token && x.expires > Date.now());
          if (!s) throw new AppError(401, 'Ссылка на корзину истекла. Вернитесь в чат.');
          return json(res, 200, assistant.cart(s));
        }
        const s = sessions.get(token);
        if (!s || s.expires < Date.now()) throw new AppError(401, 'Сессия истекла. Начните новый диалог.');
        if (s.busy) throw new AppError(409, 'Дождитесь предыдущего ответа.');
        s.busy = true;
        try {
          if (url.pathname === '/api/session' && req.method === 'DELETE') { sessions.delete(s.id); return json(res, 200, { ok: true }); }
          if (url.pathname === '/api/cart' && req.method === 'GET') return json(res, 200, { ...assistant.cart(s), cartPath: `/cart.html#${s.readToken}` });
          if (req.method !== 'POST') throw new AppError(404, 'Адрес не найден.');
          const data = await body(req);
          if (url.pathname === '/api/chat') {
            if (typeof data.message !== 'string' || data.message.length > 3000) throw new AppError(400, 'Сообщение должно быть не длиннее 3000 символов.');
            const attachment = data.attachment ? await extractAttachment(data.attachment) : null;
            const result = await assistant.chat(s, data.message, attachment);
            if (attachment?.truncated) result.text += '\nПрочитаны первые 5000 символов файла. Для остальных позиций отправьте меньший фрагмент.';
            return json(res, 200, result);
          }
          if (url.pathname === '/api/cart/prepare') return json(res, 200, await assistant.prepare(s, data.sku, data.quantity));
          if (url.pathname === '/api/cart/confirm') return json(res, 200, await assistant.confirm(s, data.proposalId, data.confirmed));
          throw new AppError(404, 'Адрес не найден.');
        } finally { s.busy = false; }
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError(405, 'Метод не разрешён.');
      const files = { '/': 'web/index.html', '/cart.html': 'web/cart.html', '/cart.js': 'web/cart.js', '/demo.js': 'web/demo.js', '/demo.css': 'web/demo.css', '/widget.html': 'extension/widget.html', '/widget.js': 'extension/widget.js', '/widget.css': 'extension/widget.css', '/sample-certificate.html': 'web/sample-certificate.html' };
      if (!files[url.pathname]) throw new AppError(404, 'Адрес не найден.');
      const content = await fs.readFile(path.join(root, files[url.pathname]));
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://ekt.kz data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' })[path.extname(files[url.pathname])] + '; charset=utf-8'); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) { if (!res.headersSent) json(res, e.status || 502, { error: e.status ? e.message : 'Источник данных временно недоступен. Попробуйте ещё раз; корзина не изменена.' }); else res.end(); }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  server.on('close', () => clearInterval(timer));
  return { server, catalog, sessions, assistant };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!['demo', 'live', undefined].includes(process.env.DATA_MODE)) throw Error('DATA_MODE must be demo or live');
  const app = createApp();
  app.server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => {
    console.log(`EKT Assistant: ${process.env.PUBLIC_BASE_URL || 'http://localhost:8787'} | ${app.catalog.live ? 'live catalog / demo cart' : 'demo'} | AI ${process.env.OPENAI_API_KEY ? 'enabled' : 'disabled'}`);
    if (app.catalog.live) { app.catalog.sync(); app.catalog.byId(515291).catch(() => {}); }
  });
}
