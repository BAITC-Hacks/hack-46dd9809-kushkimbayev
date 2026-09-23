const allowed = new Set(['/api/health', '/api/chat', '/api/cart', '/api/cart/prepare', '/api/cart/confirm', '/api/session']);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('widget.html') || message?.type !== 'api' || !allowed.has(message.path)) return;
  (async () => {
    const { serverURL = 'http://localhost:8787' } = await chrome.storage.local.get('serverURL');
    const { sessionToken } = await chrome.storage.session.get('sessionToken');
    const call = async (route, method, body, token) => {
      const r = await fetch(serverURL + route, { method, signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await r.json(); if (!r.ok) { if (r.status === 401) await chrome.storage.session.remove('sessionToken'); throw Error(data.error || 'Сервер недоступен'); } return data;
    };
    let token = sessionToken;
    if (!token && message.path !== '/api/health') { token = (await call('/api/session', 'POST', {}, null)).token; await chrome.storage.session.set({ sessionToken: token }); }
    const data = await call(message.path, message.method || 'GET', message.body, token);
    if (message.method === 'DELETE') await chrome.storage.session.remove('sessionToken');
    return { data, serverURL };
  })().then(reply).catch(e => reply({ error: e.message }));
  return true;
});
