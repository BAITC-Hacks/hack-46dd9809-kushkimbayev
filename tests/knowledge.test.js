import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { answerSiteQuestion, resolveKnowledgeSources, siteKnowledge } from '../server/knowledge.js';

test('knowledge and internal instructions are loaded from the actual source documents', () => {
  const document = readFileSync(new URL('../research/ekt-site-audit/EKT_ASSISTANT_KNOWLEDGE.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(siteKnowledge.text, document);
  assert.match(siteKnowledge.instructions, /^Ты — ИИ-помощник/);
  assert.doesNotMatch(siteKnowledge.instructions, /Использование:/);
  assert.equal(siteKnowledge.checkedAt, '23 сентября 2026 года');
});

test('citation allowlist rejects invented URLs, query modifications and non-array input', () => {
  const url = 'https://ekt.kz/checkout-delivery/';
  assert.deepEqual(resolveKnowledgeSources([url, url, 'https://evil.example/', `${url}?source=ai`, 'https://ekt.kz/invented/', null]), [{ title: 'Доставка и оплата', url }]);
  assert.deepEqual(resolveKnowledgeSources('https://ekt.kz/'), []);
});

test('every catalog category has a navigable answer while plain products stay product searches', () => {
  const queries = ['Где найти кабель?', 'Открой каталог ламп', 'Где находится низковольтная аппаратура?', 'Открой кабеленесущие системы', 'Каталог изделий для монтажа', 'Раздел прочее оборудование', 'Каталог шкафов', 'Каталог розеток', 'Раздел автоматизация', 'Раздел видеонаблюдение', 'Каталог инструмента КИП', 'Корзина Электрика', 'Магазин подарков раздел'];
  const expectedPaths = ['kabel_provod', 'svetilniki_lampy', 'nizkovoltnaya_apparatura', 'kabelenesushchie_sistemy', 'izdeliya_dlya_montazha_i_instrument', 'prochee_oborudovanie', 'shkafy_shchity', 'rozetki_vyklyuchateli_korobki', 'avtomatizatsiya', 'videonablyudenie_skud_signalizatsiya', 'instrument_kip', 'korzina_elektrika', 'magazin_podarkov_1'];
  queries.forEach((query, index) => {
    const answer = answerSiteQuestion(query);
    assert.equal(answer?.knowledgeTopic, 'navigation', query);
    assert.equal(answer.sources[0].url, `https://ekt.kz/catalog/${expectedPaths[index]}/`, query);
    assert.deepEqual(answer.products, []);
    assert.equal(answer.action, undefined);
  });
  for (const query of ['кабель', 'автомат', 'DEMO-101', 'добавь DEMO-101 2 шт', 'купи кабель', 'оформи заказ', 'оплати заказ', 'сравнение автоматов', 'кабель ВВГ 3х2,5', 'цена розетки', 'кабель телефонный', 'покажи лампу E27', 'покажи кабель']) assert.equal(answerSiteQuestion(query), null, query);
  assert.equal(answerSiteQuestion('Где найти автоматические выключатели?').sources[0].url, 'https://ekt.kz/catalog/nizkovoltnaya_apparatura/');
});

test('services lead to the relevant known pages', () => {
  for (const [query, url] of [
    ['Где личный кабинет?', 'https://ekt.kz/personal/'], ['Открой избранное', 'https://ekt.kz/favorites/'],
    ['Сравнение', 'https://ekt.kz/compare/'], ['Где корзина?', 'https://ekt.kz/personal/cart/'],
    ['Где инструкции?', 'https://ekt.kz/about/information/'], ['FAQ', 'https://ekt.kz/about/faq/'],
    ['Сотрудничество', 'https://ekt.kz/cooperation/'], ['Вакансии', 'https://ekt.kz/about/our-team/vacancy/'],
    ['Новости', 'https://ekt.kz/news/'],
  ]) assert.equal(answerSiteQuestion(query)?.sources[0]?.url, url, query);
});

test('delivery preserves both published thresholds, contradictory deadlines and checked date', () => {
  const answer = answerSiteQuestion('Какая доставка в Алматы?');
  assert.equal(answer.knowledgeTopic, 'delivery');
  for (const phrase of [/30 000/, /15 000/, /48 часов/, /следующий день/, /400 000/, /не проверены/, /23 сентября 2026/]) assert.match(answer.text, phrase);
  assert.ok(answer.sources.some(source => source.url === 'https://ekt.kz/about/howto/'));
  assert.match(answerSiteQuestion('А в Астане?', 'delivery').text, /других населённых пунктов/);
  assert.equal(answerSiteQuestion('кабель в Алматы', 'delivery'), null);
  assert.match(answerSiteQuestion('Доставка и оплата').text, /онлайн-карта/);
  assert.doesNotMatch(answer.text, /см\. раздел/);
  assert.ok(answer.text.length < 1250, answer.text.length);
});

test('payment, installment and return preserve uncertainties and never guarantee eligibility', () => {
  const payment = answerSiteQuestion('Как оплатить?');
  assert.match(payment.text, /AirbaPay/);
  assert.match(payment.text, /Robokassa/);
  assert.match(payment.text, /Срок зачисления на странице не заполнен; уточните его у продавца/i);
  const installment = answerSiteQuestion('Есть рассрочка?');
  assert.match(installment.text, /6 000–200 000/);
  assert.match(installment.text, /любой картой/);
  assert.match(installment.text, /только картой БЦК/);
  const returns = answerSiteQuestion('Можно вернуть кабель?');
  assert.match(returns.text, /одной категории товара недостаточно/);
  assert.match(returns.text, /14 дней/);
});

test('contact help does not intercept electrical contactors or contact accessories', () => {
  for (const query of ['контактор 25А', 'дополнительные контакты', 'вспомогательные контакты для реле', 'контактная группа', 'адресный датчик', 'блок-контакт']) {
    assert.equal(answerSiteQuestion(query), null, query);
  }
  assert.equal(answerSiteQuestion('Где найти контакторы?').sources[0].url, 'https://ekt.kz/catalog/nizkovoltnaya_apparatura/');
  assert.equal(answerSiteQuestion('Контакты').knowledgeTopic, 'contacts');
  assert.equal(answerSiteQuestion('Контакты менеджера по контакторам').knowledgeTopic, 'contacts');
});

test('specific product lookups retain code priority over general site navigation', () => {
  for (const query of ['Найди DEMO-101 в каталоге', 'Найди 050300004_ в каталоге', 'Где найти A9F74116?', 'Покажи DEMO-101', 'Инструкция для DEMO-101']) {
    assert.equal(answerSiteQuestion(query), null, query);
  }
  assert.equal(answerSiteQuestion('Какие разделы есть в каталоге сайта?').knowledgeTopic, 'navigation');
  assert.equal(answerSiteQuestion('Как найти код товара?').knowledgeTopic, 'search');
});

test('explicit combined site questions preserve all topics, unique citations and one checked date', () => {
  const returnsAndContacts = answerSiteQuestion('Как вернуть товар и где контакты Алматы?');
  assert.match(returnsAndContacts.text, /14 дней/);
  assert.match(returnsAndContacts.text, /346-88-88/);
  assert.ok(returnsAndContacts.sources.some(source => source.url === 'https://ekt.kz/return/'));
  assert.ok(returnsAndContacts.sources.some(source => source.url === 'https://ekt.kz/about/contacts/'));
  const proAndPrice = answerSiteQuestion('Что такое EKT PRO и как скачать прайс?');
  assert.match(proAndPrice.text, /отдельная платформа/);
  assert.match(proAndPrice.text, /форму «Скачать прайс»/);
  assert.ok(proAndPrice.sources.some(source => source.url === 'https://pro.ekt.kz/'));
  const deliveryPaymentContacts = answerSiteQuestion('Доставка и оплата, контакты в Астане');
  assert.match(deliveryPaymentContacts.text, /других населённых пунктов/);
  assert.match(deliveryPaymentContacts.text, /онлайн-карта/);
  assert.match(deliveryPaymentContacts.text, /странице контактов/);
  for (const answer of [returnsAndContacts, proAndPrice, deliveryPaymentContacts]) {
    assert.equal(answer.text.split(siteKnowledge.checkedAt).length - 1, 1);
    assert.equal(new Set(answer.sources.map(source => source.url)).size, answer.sources.length);
  }
  assert.equal(answerSiteQuestion('Доставка и оплата').knowledgeTopic, 'delivery');
  assert.equal(answerSiteQuestion('Что такое EKT PRO?').knowledgeTopic, 'pro');
  assert.equal(answerSiteQuestion('Как вернуть оплату?').knowledgeTopic, 'returns');
});

test('customer-facing reference replies explain limits without exposing assistant instructions', () => {
  for (const query of ['Возврат', 'Оплата', 'Рассрочка']) {
    const answer = answerSiteQuestion(query);
    assert.doesNotMatch(answer.text, /Ассистент уточняет|не делает автоматический отказ|Не выдумывать|Не выбирать удобный вариант|Не обещать|Ориентироваться/iu);
  }
  assert.match(answerSiteQuestion('Возврат').text, /Для оценки возврата нужны дата, товар, причина и место покупки/);
  assert.match(answerSiteQuestion('Рассрочка').text, /Требования к карте уточните/);
});

test('contacts, EKT PRO, price requests, custom shields and architecture come from knowledge', () => {
  assert.match(answerSiteQuestion('Телефон в Алматы').text, /346-88-88/);
  assert.doesNotMatch(answerSiteQuestion('Контакты в Астане').text, /346-88-88|укажите город/i);
  assert.doesNotMatch(answerSiteQuestion('Контакты в Алматы').text, /укажите город/i);
  assert.match(answerSiteQuestion('Что такое EKT PRO?').text, /работа этих функций внутри кабинета не проверена/);
  assert.match(answerSiteQuestion('Скачать прайс').text, /не гарантированную немедленную загрузку/);
  assert.equal(answerSiteQuestion('Щиты под заказ').sources[0].url, 'https://ekt.kz/shields/');
  assert.match(answerSiteQuestion('Архитектура сайта').text, /1С-Битрикс/);
  assert.match(answerSiteQuestion('О сайте').text, /Электрокомплект/);
});

test('minimum-order answers distinguish unconfirmed global limits from product quantities', () => {
  for (const query of ['Минимальная сумма заказа', 'Минимальная партия', 'Кратность заказа']) {
    const answer = answerSiteQuestion(query);
    assert.equal(answer.knowledgeTopic, 'minimum-order');
    assert.match(answer.text, /не подтверждена единая минимальная сумма/);
    assert.match(answer.text, /карточке конкретного товара/);
  }
});

test('reference responses render as plain text and support common Kazakh topic requests', () => {
  for (const [query, topic] of [['Жеткізу бар ма?', 'delivery'], ['Төлем тәсілдері', 'payment'], ['Қайтару шарттары', 'returns'], ['Бөліп төлеу', 'installment'], ['Байланыс', 'contacts']]) {
    const answer = answerSiteQuestion(query);
    assert.equal(answer.knowledgeTopic, topic);
    assert.doesNotMatch(answer.text, /\|.*\||\[[^\]]+\]\(|\*\*|`/);
    assert.deepEqual(answer.products, []);
    for (const source of answer.sources) assert.ok(siteKnowledge.sources.some(allowed => allowed.url === source.url));
  }
});
