const root = document.getElementById('ekt-design-directions');
const find = selector => root.querySelector(selector);
if (location.protocol === 'chrome-extension:' && window.top === window) document.documentElement.classList.add('popup');
if (window.parent !== window) document.documentElement.classList.add('embedded');
const photo = find('.product-photo img');
photo.onerror = () => { photo.hidden = true; find('.photo-fallback').hidden = false; };
const review = find('[data-review]');
review.onclick = () => {
  find('[data-confirm]').hidden = false;
  find('[data-success]').hidden = true;
  find('[data-confirm]').scrollIntoView({ block: 'nearest' });
};
find('[data-confirm-no]').onclick = () => { find('[data-confirm]').hidden = true; };
find('[data-confirm-yes]').onclick = () => {
  find('[data-confirm]').hidden = true;
  find('[data-success]').hidden = false;
  find('[data-success]').textContent = 'Готово в макете: 50 м · 16 700 ₸. Корзина сайта не изменена.';
  review.textContent = 'Добавлено в макете';
  review.disabled = true;
  find('[data-success]').scrollIntoView({ block: 'nearest' });
};
root.querySelectorAll('[data-info]').forEach(button => button.onclick = () => {
  const replies = {
    cert: 'Сертификат: в рабочей версии здесь появится документ из каталога. Это пример интерфейса.',
    stock: 'Склады: здесь появятся город, доступное количество и время проверки. Остатки в макете не проверяются.',
    analog: 'Для каждого аналога покажем совпадающие характеристики и отличия. Это пример интерфейса подбора.'
  };
  find('[data-detail]').hidden = false;
  find('[data-detail]').textContent = replies[button.dataset.info];
  find('[data-detail]').scrollIntoView({ block: 'nearest' });
});
find('form').onsubmit = event => {
  event.preventDefault();
  const input = find('input');
  if (!input.value.trim()) return;
  find('[data-user-message]').textContent = input.value.trim();
  input.value = '';
  find('[data-detail]').hidden = false;
  find('[data-detail]').textContent = 'Это демонстрация дизайна. В рабочем ассистенте здесь будет ответ по каталогу ekt.kz.';
  find('[data-detail]').scrollIntoView({ block: 'nearest' });
};
find('.close').onclick = () => {
  if (window.parent !== window) {
    // Visibility-only message; no user data or credentials leave the frame.
    window.parent.postMessage({ type: 'ekt-design-close' }, '*');
  } else if (location.protocol === 'chrome-extension:') window.close();
};
