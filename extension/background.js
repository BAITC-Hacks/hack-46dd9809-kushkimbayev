importScripts('config.js');
const allowed = new Map([
  ['/api/health', ['GET']], ['/api/chat', ['POST']],
  ['/api/cart/prepare', ['POST']], ['/api/cart/confirm', ['POST']], ['/api/session', ['DELETE']],
]);
chrome.action.onClicked.addListener(async tab => {
  if (tab?.id) {
    try { const result = await chrome.tabs.sendMessage(tab.id, { type: 'ekt-assistant-open' }); if (result?.opened) return; } catch {}
  }
  await chrome.tabs.create({ url: 'https://ekt.kz' });
});
let creatingSession;
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const method = message?.method || 'GET';
  const widgetURLs = [chrome.runtime.getURL('widget.html'), chrome.runtime.getURL('widget.html?embedded=1')];
  if (sender.id !== chrome.runtime.id || !widgetURLs.includes(sender.url) || message?.type !== 'api' || !allowed.get(message.path)?.includes(method)) return;
  (async () => {
    const serverURL = globalThis.EKT_CONFIG.serverURL;
    const call = async (route, verb, body, token) => {
      let r;
      try {
        r = await fetch(serverURL + route, { method: verb, signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch { throw Error('Сервер не запущен. Откройте Start-EKT.cmd на этом компьютере и повторите сообщение.'); }
      const data = await r.json();
      if (!r.ok) { const error = Error(data.error || 'Сервер временно недоступен.'); error.status = r.status; throw error; }
      return data;
    };
    const getSession = async () => {
      const saved = await chrome.storage.session.get(['sessionToken', 'sessionServer']);
      if (saved.sessionToken && saved.sessionServer === serverURL) return saved.sessionToken;
      if (!creatingSession) creatingSession = call('/api/session', 'POST', {}, null).then(async data => { await chrome.storage.session.set({ sessionToken: data.token, sessionServer: serverURL }); return data.token; }).finally(() => { creatingSession = null; });
      return creatingSession;
    };
    if (message.path === '/api/health') return { data: await call(message.path, method), serverURL };
    const token = await getSession();
    let data;
    try { data = await call(message.path, method, message.body, token); }
    catch (error) {
      if (error.status !== 401) throw error;
      await chrome.storage.session.remove(['sessionToken', 'sessionServer']);
      // A stale confirmation must never be replayed in a new session.
      if (message.path === '/api/cart/confirm') throw Error('Сессия обновилась. Выберите товар и подтвердите добавление заново.');
      data = await call(message.path, method, message.body, await getSession());
    }
    if (method === 'DELETE') await chrome.storage.session.remove(['sessionToken', 'sessionServer']);
    if (message.path === '/api/chat' && data.matchType === 'exact' && data.navigation?.type === 'open_product' && !message.body?.attachment) {
      try {
        const target = new URL(data.navigation.url);
        if (target.protocol !== 'https:' || target.hostname !== 'ekt.kz' || target.port || target.username || target.password || !target.pathname.startsWith('/catalog/')) throw Error('Invalid product URL');
        await chrome.tabs.create({ url: target.href, active: true });
        data.navigation.opened = true;
      } catch { data.navigation.opened = false; }
    }
    return { data, serverURL };
  })().then(reply).catch(error => reply({ error: error.message }));
  return true;
});
