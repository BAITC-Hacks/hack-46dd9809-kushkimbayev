(() => {
  if (document.getElementById('ekt-assistant-host')) return;
  const host = document.createElement('div'); host.id = 'ekt-assistant-host';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;position:fixed!important;bottom:22px!important;right:22px!important;z-index:2147483647!important}button{border:0;background:#c6fa66;color:#192722;border-radius:40px;padding:17px 24px;font:700 15px system-ui;box-shadow:0 8px 30px #0003;cursor:pointer}iframe{display:block;position:absolute;right:0;bottom:70px;width:410px;height:min(740px,calc(100dvh - 120px));border:0;border-radius:22px;box-shadow:0 16px 70px #0004;background:white}iframe[hidden]{display:none}@media(max-width:480px){:host{right:10px!important;bottom:10px!important}iframe{width:calc(100vw - 20px);height:calc(100dvh - 90px);bottom:64px}}`;
  const frame = document.createElement('iframe'); frame.src = chrome.runtime.getURL('widget.html'); frame.title = 'EKT — помощник по электротехнике'; frame.hidden = true;
  const button = document.createElement('button'); button.textContent = '✦ Спросить ассистента'; button.setAttribute('aria-expanded', 'false');
  button.onclick = () => { frame.hidden = !frame.hidden; button.textContent = frame.hidden ? '✦ Спросить ассистента' : '× Закрыть чат'; button.setAttribute('aria-expanded', String(!frame.hidden)); };
  shadow.append(style, frame, button); document.documentElement.append(host);
})();
