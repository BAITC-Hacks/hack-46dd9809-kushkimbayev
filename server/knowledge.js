import { readFileSync } from 'node:fs';

const knowledgeRoot = new URL('../research/ekt-site-audit/', import.meta.url);
const readKnowledge = name => readFileSync(new URL(name, knowledgeRoot), 'utf8').replace(/\r\n/g, '\n');
const text = readKnowledge('EKT_ASSISTANT_KNOWLEDGE.md');
const prompt = readKnowledge('EKT_ASSISTANT_PROMPT.md');
const instructions = prompt.split(/^---\s*$/m).slice(1).join('\n---\n').trim();
if (!instructions) throw new Error('EKT_ASSISTANT_PROMPT.md must contain instructions after its --- separator.');

const linksIn = value => [...value.matchAll(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g)]
  .map(([, title, url]) => ({ title: title.replace(/[*`]/g, ''), url }));
const sourceMap = new Map();
for (const source of linksIn(text)) if (!sourceMap.has(source.url)) sourceMap.set(source.url, Object.freeze(source));
const checkedAt = text.match(/Проверено:\s*\*\*([^*]+)\*\*/)?.[1] ?? 'дата не указана';

export const siteKnowledge = Object.freeze({ text, instructions, checkedAt, sources: Object.freeze([...sourceMap.values()]) });

// Retrieve a compact passage from the same research files; no outside knowledge is added.
export function researchEvidence(question, previousTopic) {
  const known = answerSiteQuestion(question, previousTopic);
  if (known) return `${known.text}\n\nИсточники:\n${known.sources.map(source => `[${source.title}](${source.url})`).join('\n')}`;
  const terms = String(question).toLowerCase().match(/[\p{L}\d]{4,}/gu) || [];
  const blocks = text.split(/\n\s*\n/).map(block => ({ block, score: terms.reduce((score, word) => score + (block.toLowerCase().includes(word.slice(0, Math.max(4, word.length - 2))) ? 1 : 0), 0) }))
    .filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  let evidence = '';
  for (const { block } of blocks) if (Buffer.byteLength(evidence + block, 'utf8') < 5000) evidence += `${block}\n\n`;
  return evidence.trim() || 'В research нет подтверждённых сведений по этому вопросу. Не выдумывай факты о магазине. Дай общую консультацию или задай уточняющий вопрос.';
}

// Never promote model-generated URLs to citations, even when their host is ekt.kz.
export function resolveKnowledgeSources(urls) {
  if (!Array.isArray(urls)) return [];
  const seen = new Set();
  return urls.filter(url => typeof url === 'string' && sourceMap.has(url) && !seen.has(url) && seen.add(url))
    .map(url => ({ ...sourceMap.get(url) }));
}

function section(number) {
  return text.match(new RegExp(`^## ${number}\\. [^\\n]+\\n([\\s\\S]*?)(?=^## \\d+\\.|(?![\\s\\S]))`, 'm'))?.[1]?.trim() ?? '';
}

function plain(value) {
  return value.replace(/\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g, '$1')
    .replace(/[*`]/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*-\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const paragraphWith = (value, pattern) => value.split(/\n\s*\n/).find(paragraph => pattern.test(paragraph)) ?? '';
const tableRows = value => value.split('\n').filter(line => line.startsWith('|') && !/^[|\s:-]+$/.test(line)).slice(1)
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
const navigation = section(2);
const catalogTable = navigation.split('### Каталог')[1]?.split('### Служебные разделы')[0] ?? '';
const categoryRows = tableRows(catalogTable);
const serviceRows = tableRows(navigation.split('### Служебные разделы')[1] ?? '');
const serviceLink = label => [...sourceMap.values()].find(source => source.title === label);
const purchase = section(4);
const purchaseIntro = paragraphWith(purchase, /^Покупатель /);
const delivery = purchase.split('\n').filter(line => /^- (?:Алматы|Бесплатно|Для других)/.test(line)).join('\n');
const payment = purchase.split('\n').filter(line => /^- Для физических/.test(line)).join('\n');
const limits = paragraphWith(purchase, /^\*\*Это опубликованные/).replace(/ Есть противоречащие страницы[^.]+\./, '');
const installment = paragraphWith(purchase, /^\[Рассрочка\]/);
const returns = paragraphWith(purchase, /^\[Возврат\]/);
const conflicts = tableRows(section(6));
const conflictText = pattern => conflicts.filter(row => pattern.test(row[0]))
  .map(([topic, finding, response]) => `${topic}: ${finding}. ${response}.`).join('\n');
const conflictFindings = pattern => conflicts.filter(row => pattern.test(row[0]))
  .map(([topic, finding]) => `${topic}: ${finding}.`).join('\n');
const conflictSources = pattern => conflicts.filter(row => pattern.test(row[0])).map(row => row.join(' ')).join('\n');
const timestamp = `Сведения в базе проверены ${checkedAt}; изменения после этой даты не проверены.`;

function userFacing(value) {
  return value
    .replace('Ассистент уточняет дату, товар, причину и место покупки и направляет в подразделение продавца; не обещает возврат и не делает автоматический отказ по одному признаку «кабель».', 'Для оценки возврата нужны дата, товар, причина и место покупки. Обратитесь в подразделение продавца: одной категории товара недостаточно, чтобы подтвердить возможность возврата или отказ.')
    .replace('Не обещать одобрение или неизменность этих условий.', 'Одобрение и актуальные условия определяет провайдер при оформлении.')
    .replace('Сослаться на профильную страницу и явно уточнить условия заказа у менеджера', 'Условия конкретного заказа уточните у менеджера по профильной странице доставки')
    .replace('Не обещать конкретную дату без подтверждения', 'Конкретную дату должен подтвердить менеджер')
    .replace('Ориентироваться на реально предложенный способ в оформлении', 'Используйте способ, доступный при оформлении заказа')
    .replace('Не выбирать удобный вариант; направить к актуальным условиям провайдера', 'Требования к карте уточните в актуальных условиях провайдера')
    .replace('Не выдумывать срок зачисления', 'Срок зачисления на странице не заполнен; уточните его у продавца')
    .replace('Для кабеля учитывать признак метражного товара, единицу продажи и кратность.', 'Для кабеля проверьте единицу продажи, метраж и кратность.');
}

function result(topic, body, citations = body, dated = false) {
  return {
    text: `${userFacing(plain(body))}${dated ? `\n\n${timestamp}` : ''}`,
    sources: resolveKnowledgeSources(linksIn(citations).map(source => source.url)),
    products: [],
    knowledgeTopic: topic,
  };
}

const categoryPatterns = [
  /кабел[ьяюе]|кабель|провод|сым/,
  /светильник|ламп|освещен|прожектор|лента|жарық|шам/,
  /низковольт|автомат(?!изац)|дифференц|контактор|рубильник|предохранител/,
  /кабеленес|кабель.?канал|лотк|металлорукав|труб/,
  /монтаж|клемм|шин[аыу]|муфт|гильз|наконечник|крепеж|изолент/,
  /прочее|стабилизатор|заземлен|молниезащит|теплов|лестниц/,
  /шкаф|щит|қалқан/,
  /розет|выключател|коробк|разъем|удлинител/,
  /автоматизац|авр|блок[аи]? питани|преобразовател|реле|панел[ьи] оператор/,
  /видеонаблюд|скуд|сигнализац|камер|регистратор|домофон|датчик/,
  /инструмент|кип|измеритель|экипировк/,
  /корзина электрика/,
  /подар/,
];

function categoryFor(query) {
  if (/автоматическ[а-я]* выключател/.test(query)) return categoryRows[2];
  // A compound cable-system name must take priority over the generic word cable.
  const order = [11, 3, 8, 9, 12, 7, 6, 1, 2, 5, 4, 10, 0];
  return order.map(index => ({ row: categoryRows[index], pattern: categoryPatterns[index] }))
    .find(entry => entry.row && entry.pattern.test(query))?.row;
}

const serviceRoutes = [
  { label: 'Личный кабинет', pattern: /личн[а-я]* кабинет|войти|регистрац|зарегистрир|восстановить доступ|забыл[аи]? пароль|жеке кабинет|тіркел/ },
  { label: 'Избранное', pattern: /избранн|сохраненн[а-я]* подбор|таңдаулы/ },
  { label: 'Сравнение', pattern: /сравнен|сопоставить характеристики|салыстыр/ },
  { label: 'Корзина', pattern: /корзин|себет/ },
  { label: 'Полезная информация', pattern: /полезн[а-я]* информац|инструкци|калькулятор|видео(?:урок|$)|стать[яи]|пайдалы ақпарат/ },
  { label: 'FAQ', pattern: /faq|часто задаваем|общие вопросы/ },
  { label: 'Сотрудничество', pattern: /сотруднич|поставщик|стать клиент|серіктес/ },
  { label: 'Вакансии', pattern: /ваканси|работа в компани|трудоустро|бос орын/ },
  { label: 'Новости', pattern: /новост|событи|жаңалық/ },
];

function routeResult(label) {
  const link = serviceLink(label);
  const row = serviceRows.find(row => linksIn(row.join(' ')).some(source => source.url === link?.url));
  if (!link || !row) return null;
  const caveat = label === 'Личный кабинет' ? ' На просмотренной странице вход также открывался в модальном окне.' : '';
  return result('navigation', `${label}: ${plain(row[0])}. Откройте раздел по ссылке ниже.${caveat}`, `[${label}](${link.url})`);
}

const cityPattern = /(?:алматы|астан[аеуы]?|нур.?султан|шымкент|актау|атырау|тараз|усть.?каменогорск|караганда|талдыкорган|өскемен|қарағанды|талдықорған)/i;
const cityFollowup = new RegExp(`^(?:а\\s+)?(?:в\\s+|для\\s+|по\\s+)?${cityPattern.source}[?!.]*$`, 'i');
const normalize = value => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

function isContactQuestion(query) {
  const direct = /(?:^|[^\p{L}])(?:телефон(?:а|у|ы|ов)?|адрес(?:а|у|ом|ов)?)(?=$|[^\p{L}])|филиал|связаться|менеджер|режим работы|график|время работы|во сколько|байланыс|мекенжай|жұмыс уақыты/u;
  const contacts = /(?:^|[^\p{L}])контакт(?:ы|ов|ами|ам)?(?=$|[^\p{L}])/u;
  const hardware = /контактор|контактн[а-я]* (?:групп|блок)|(?:дополнительн|вспомогательн|силов|замыкающ|размыкающ)[а-я]* контакт|контакт[а-я]* (?:для|к|на) (?:реле|выключател)|блок[ -]?контакт/u;
  return direct.test(query) || (contacts.test(query) && !hardware.test(query));
}

const referenceTopics = [
  { topic: 'installment', pattern: /рассроч|бөліп төле|0[ -]0[ -]4|бцк/, question: 'Рассрочка' },
  { topic: 'returns', pattern: /возврат|вернуть|обмен|қайтар|айырбастау/, question: 'Возврат' },
  { topic: 'delivery', pattern: /достав|самовывоз|получить заказ|бесплатно привез|жеткіз|алып кет/, question: 'Доставка' },
  { topic: 'payment', pattern: /оплат|платеж|наличн|безнал|airbapay|robokassa|cloudpayments|төле|төлем/, question: 'Оплата' },
  { topic: 'contacts', matches: isContactQuestion, question: 'Контакты' },
  { topic: 'pro', pattern: /ekt\s*pro|ект\s*про|pro\.ekt|b2b|бизнес.клиент|корпоративн[а-я]* кабинет/, question: 'EKT PRO' },
  { topic: 'price-list', pattern: /прайс|список цен/, question: 'Скачать прайс' },
];

function isSpecificProductRequest(query) {
  // This only recognizes a code-shaped token; the catalog still resolves the actual product.
  const code = /(?:^|[^\p{L}\p{N}_-])(?:(?=[a-z\d_-]*[a-z])(?=[a-z\d_-]*\d)[a-z\d][a-z\d_-]{2,}|\d{4,}_?)(?=$|[^\p{L}\p{N}_-])/iu;
  return code.test(query) && /найди|найти|найдите|покажи|покажите|ищу|цена|цену|стоимость|сколько стоит|наличие|характеристик|инструкци|сертификат/u.test(query);
}

/** Read-only reference answers. A null result leaves product search/actions to their own tools. */
export function answerSiteQuestion(message, previousTopic = null) {
  if (typeof message !== 'string') return null;
  const query = normalize(message);
  if (isSpecificProductRequest(query)) return null;
  const primary = answerSingleSiteQuestion(query, previousTopic);
  if (!primary || !/(?:[,;]|[?!]\s+\S|(?:^|\s)(?:и|а также|также)(?:\s|$))/u.test(query)) return primary;
  const topics = referenceTopics.filter(entry => entry.matches ? entry.matches(query) : entry.pattern.test(query));
  if (topics.length < 2 || (topics.length === 2 && topics.every(entry => ['delivery', 'payment'].includes(entry.topic)))) return primary;
  const city = query.match(cityPattern)?.[0] ?? '';
  const hasDelivery = topics.some(entry => entry.topic === 'delivery');
  const hasPayment = topics.some(entry => entry.topic === 'payment');
  const answers = topics.filter(entry => !(hasDelivery && entry.topic === 'payment')).map(entry => {
    const question = entry.topic === 'delivery' && hasPayment ? 'Доставка и оплата' : entry.question;
    return answerSingleSiteQuestion(`${question} ${['delivery', 'contacts'].includes(entry.topic) ? city : ''}`);
  }).filter(Boolean);
  const dated = answers.some(answer => answer.text.includes(timestamp));
  return {
    text: answers.map(answer => answer.text.replace(`\n\n${timestamp}`, '')).join('\n\n') + (dated ? `\n\n${timestamp}` : ''),
    sources: resolveKnowledgeSources(answers.flatMap(answer => answer.sources.map(source => source.url))),
    products: [], knowledgeTopic: 'site',
  };
}

function answerSingleSiteQuestion(message, previousTopic = null) {
  if (typeof message !== 'string') return null;
  const query = normalize(message);
  if (!query) return null;
  const mutating = /(?:^|[\s,;])(?:добавь|добавить|купи|купить|закажи|оформи|оплати|удали|отправь|измени|подтверждаю|қос|сатып ал)(?:[\s,!?.]|$)/u;
  const explanatory = /как |как мне |можно ли |порядок |способ|қалай /u;
  if (mutating.test(query) && !explanatory.test(query)) return null;

  const contextualCity = cityFollowup.test(query);
  const followup = contextualCity && ['delivery', 'contacts', 'payment'].includes(previousTopic);
  const selectedCity = query.match(cityPattern)?.[0];

  if (/корзина электрика/.test(query)) {
    const row = categoryRows[11];
    return result('navigation', `${row[0]} — ${row[1]}. Это категория каталога, а не корзина покупателя.`, row.join(' '));
  }

  if (/рассроч|бөліп төле|0[ -]0[ -]4|бцк/.test(query)) {
    return result('installment', `${installment}\n\n${conflictText(/^Рассрочка$/)}`, installment + conflictSources(/^Рассрочка$/), true);
  }
  if (/возврат|вернуть|обмен|қайтар|айырбастау/.test(query)) {
    return result('returns', `${returns}\n\n${conflictText(/^Возврат денег$/)}`, returns + conflictSources(/^Возврат денег$/), true);
  }
  if (/достав|самовывоз|получить заказ|бесплатно привез|жеткіз|алып кет/.test(query) || (followup && previousTopic === 'delivery')) {
    const includePayment = /оплат|платеж|төлем|төле/.test(query);
    const paymentDetails = includePayment ? `\n\n${payment}\n\n${conflictFindings(/Платёжный провайдер/)}` : '';
    const paymentSources = includePayment ? conflictSources(/Платёжный провайдер/) : '';
    const relevantDelivery = selectedCity && !/алматы/.test(selectedCity) ? delivery.split('\n').filter(line => /Для других/.test(line)).join('\n') : delivery;
    const detail = includePayment ? '' : `\n\n${limits}`;
    return result('delivery', `${relevantDelivery}${detail}\n\n${conflictFindings(/Бесплатная доставка|Срок доставки/)}${paymentDetails}\n\nУсловия заказа подтвердит менеджер. Самовывоз — после подтверждения готовности.`, purchaseIntro + purchase.match(/На странице [^\n]+/)?.[0] + conflictSources(/Бесплатная доставка|Срок доставки/) + paymentSources, true);
  }
  if (/оплат|платеж|платежн|наличн|безнал|airbapay|robokassa|cloudpayments|төле|төлем/.test(query) || (followup && previousTopic === 'payment')) {
    return result('payment', `${payment}\n\n${conflictText(/Платёжный провайдер|Возврат денег/)}\n\nОриентируйтесь на способ оплаты, предложенный при оформлении.`, purchase.match(/На странице [^\n]+/)?.[0] + conflictSources(/Платёжный провайдер|Возврат денег/), true);
  }
  if (isContactQuestion(query) || (followup && previousTopic === 'contacts')) {
    const contactSection = section(5);
    const contactParagraph = paragraphWith(contactSection, /^Контакты Алматы:/);
    const hours = contactParagraph.match(/Там указан график[^.]+\./)?.[0]?.replace(/^Там указан/, 'Опубликован') ?? '';
    const almaty = contactParagraph.split('Для остальных городов')[0].trim();
    const cityList = paragraphWith(contactSection, /^Города:/).split('Старое название')[0].trim();
    const body = selectedCity ? (/алматы/.test(selectedCity) ? almaty : 'Телефон и адрес выбранного филиала указаны на странице контактов. Выберите нужный город по ссылке ниже; в базе нет подтверждённых контактов этого филиала.') : `${cityList}\n\nДля телефона и адреса филиала укажите город или откройте страницу контактов.`;
    return result('contacts', `${body}\n\n${hours} Перед поездкой уточните график с учётом праздников.`, contactSection, true);
  }
  if (/ekt\s*pro|ект\s*про|pro\.ekt|b2b|бизнес.клиент|корпоративн[а-я]* кабинет/.test(query)) {
    const info = paragraphWith(section(1), /^- \*\*ekt\.kz/).split('\n').filter(line => /pro\.ekt\.kz/.test(line)).join('\n');
    return result('pro', `${info}\n\nЭто отдельная платформа. Для сведений о ваших заказах и счетах нужен авторизованный доступ; база знаний не содержит их статусы.`, info, true);
  }
  if (/прайс|прайс.лист|список цен/.test(query)) {
    const paragraph = paragraphWith(navigation, /«Оставить заявку»/);
    return result('price-list', paragraph.split('Общая заявка')[0] + ' Используйте форму «Скачать прайс» на сайте.', section(1).split('\n')[0], true);
  }
  if (/(?:щит|қалқан).*(?:под заказ|сборк|проект|индивидуальн|заказать)|(?:сборк|проект|изготовлен).*(?:щит|қалқан)/.test(query)) {
    const link = serviceLink('Щиты под заказ');
    const formInfo = paragraphWith(navigation, /«Оставить заявку»/).split('На странице щитов')[1] ?? '';
    return result('shields', `Щиты под заказ: индивидуальная сборка. На странице щитов${formInfo} Откройте форму по ссылке ниже; отправку заявки нужно выполнить в форме.`, link ? `[${link.title}](${link.url})` : '', true);
  }
  if (/минимальн[а-я]* (?:сумм|заказ|парт|количеств)|кратност|минимум заказа/.test(query)) {
    const quantityInfo = section(3).split('\n').find(line => /Для кабеля учитывать/.test(line)) ?? '';
    return result('minimum-order', `В базе не подтверждена единая минимальная сумма заказа. Минимальное количество, единицу продажи и кратность нужно проверять в карточке конкретного товара или у менеджера.\n\n${quantityInfo}`, purchaseIntro, true);
  }
  if (/как (?:сделать|оформить|купить|заказать)|порядок покуп|условия покуп|юридическ[а-я]* лиц|реквизит|сенімхат|тапсырыс беру/.test(query)) {
    return result('purchase', `${purchaseIntro}\n\n${payment}`, purchaseIntro + purchase.match(/На странице [^\n]+/)?.[0], true);
  }
  if (/архитектур|битрикс|bitrix|sitemap|robots\.txt|технолог|на чем (?:сделан|работает)|движок/.test(query)) {
    return result('architecture', navigation.split('### Каталог')[0], navigation.split('### Каталог')[0], true);
  }
  if (/о компани|что (?:это за|такое) (?:сайт|ekt|ект)|о сайте|расскажи (?:про|о) (?:сайт|ekt|ект)|немен айналысады/.test(query)) {
    return result('about', section(1), section(1), true);
  }
  if (/как (?:найти|искать|работает поиск)|поиск по|код товара|артикул поставщика|бағасын қалай/.test(query)) {
    return result('search', section(3).split('Проверенный пример:')[0], section(3));
  }

  const navigationRequest = /где (?:найти|наход|посмотр)|куда (?:перейти|нажать)|(?:открой|открыть|ссылка|перейти|раздел|каталог|категор|навигац|бөлім|қайдан|қай жерде|ашып)/.test(query);
  if (navigationRequest) {
    const category = categoryFor(query);
    if (category) return result('navigation', `${category[0]} — ${category[1]}. Откройте раздел по ссылке ниже.`, category.join(' '));
  }
  for (const route of serviceRoutes) {
    if (!route.pattern.test(query)) continue;
    // A bare request to compare products belongs to product selection, not navigation.
    if (route.label === 'Сравнение' && !navigationRequest && !/^(?:сравнение|салыстыру)[.!?]*$/u.test(query)) continue;
    return routeResult(route.label);
  }
  if (/новинк|спецпредложен/.test(query)) {
    const paragraph = paragraphWith(catalogTable, /^Отдельные подборки:/);
    return result('navigation', paragraph, paragraph, true);
  }
  if (navigationRequest && /каталог|категор|навигац|раздел.*сайт|бөлім/.test(query)) {
    const names = categoryRows.map(row => `• ${plain(row[0])}: ${plain(row[1])}`).join('\n');
    return result('navigation', `Основные категории каталога:\n${names}`, categoryRows.map(row => row.join(' ')).join('\n'));
  }
  return null;
}
