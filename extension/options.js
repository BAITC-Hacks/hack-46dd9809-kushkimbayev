const input = document.querySelector('#server');
chrome.storage.local.get('serverURL').then(v => { input.value = v.serverURL || 'http://localhost:8787'; });
document.querySelector('#origin').textContent = `chrome-extension://${chrome.runtime.id}`;
document.querySelector('#settings').onsubmit = async e => {
  e.preventDefault(); const status = document.querySelector('#status');
  try {
    const url = new URL(input.value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '8787'))) throw Error('Укажите HTTPS-адрес без пути, либо http://localhost:8787.');
    if (url.protocol === 'https:' && !await chrome.permissions.request({ origins: [`${url.origin}/*`] })) throw Error('Доступ к серверу не разрешён.');
    await chrome.storage.local.set({ serverURL: url.origin }); await chrome.storage.session.remove('sessionToken'); status.textContent = 'Сохранено. Перезагрузите страницу ekt.kz.';
  } catch (error) { status.textContent = error.message; }
};
