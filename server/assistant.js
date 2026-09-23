import { randomUUID } from 'node:crypto';
import { stockOf } from './catalog.js';
import { answerSiteQuestion, siteKnowledge, resolveKnowledgeSources } from './knowledge.js';
import { exactProductMatch } from './search.js';
export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new AppError(status, message); };
export function createSession() {
  return { id: randomUUID(), proposal: null, completed: new Map(), lastProducts: [], knowledgeTopic: null, aiCalls: 0, expires: Date.now() + 2 * 3600000, busy: false };
}
export class Assistant {
  constructor(catalog, ai) { this.catalog = catalog; this.ai = ai; }
  siteReply(session, question, response) {
    session.lastQuery = question.slice(0, 500);
    session.knowledgeTopic = response.knowledgeTopic || 'site';
    session.lastProducts = [];
    return { ...response, knowledgeCheckedAt: siteKnowledge.checkedAt };
  }
  exactReply(session, question, match) {
    if (match?.products.length !== 1) return null;
    const product = match.products[0];
    let url;
    try { url = new URL(product.url); } catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'ekt.kz' || !url.pathname.startsWith('/catalog/') || url.username || url.password || url.port) return null;
    session.lastQuery = question.slice(0, 500); session.lastProducts = [product.sku]; session.knowledgeTopic = null;
    return { text: `${product.name}.`, products: [], matchType: 'exact',
      navigation: { id: randomUUID(), type: 'open_product', url: url.href, sku: product.sku, name: product.name } };
  }
  async researchReply(session, question, information) {
    let problem = this.ai?.enabled ? null : 'AI_DISABLED';
    if (this.ai?.enabled) {
      try {
        const result = await this.ai.interpret(question, session, undefined, { researchOnly: true });
        const urls = result?.source_urls;
        const sources = resolveKnowledgeSources(urls);
        if (result?.intent === 'assistant_reply' && typeof result.answer === 'string' && result.answer.trim() && result.answer.length <= 3000 && !/https?:|www\.|<\/?[a-z]/iu.test(result.answer) && Array.isArray(urls) && urls.length === 0) {
          return this.siteReply(session, question, { text: result.answer.trim(), products: [], sources: [], answerMode: 'assistant-ai' });
        }
        if (result?.intent === 'site_info' && typeof result.answer === 'string' && result.answer.trim() && result.answer.length <= 3000 && !/https?:|www\.|<\/?[a-z]/iu.test(result.answer) && Array.isArray(urls) && urls.length > 0 && urls.length <= 4 && urls.every(url => resolveKnowledgeSources([url]).length) && sources.length) {
          return this.siteReply(session, question, { text: result.answer.trim(), products: [], sources, answerMode: 'research-ai', knowledgeTopic: information?.knowledgeTopic || 'site' });
        }
        problem = 'NO_EVIDENCE';
      } catch (error) { problem = ['AI_LIMIT', 'AI_CONNECTION', 'AI_AUTH', 'AI_QUOTA'].includes(error.message) ? error.message : 'AI_UNAVAILABLE'; }
    }
    if (information) return this.siteReply(session, question, { ...information, answerMode: 'research-fallback', aiStatus: problem });
    const text = problem === 'AI_DISABLED' ? 'ИИ сейчас не подключён. В базе research нет готового ответа на этот вопрос. Могу помочь с каталогом, условиями покупки и разделами ekt.kz.'
      : problem === 'AI_LIMIT' ? 'Достигнут установленный лимит запросов или токенов ИИ. Попробуйте позже или начните новый диалог, если исчерпан лимит сессии.'
      : problem === 'AI_CONNECTION' ? 'Не удалось подключиться к OpenAI. Проверьте интернет-соединение сервера и повторите вопрос.'
      : problem === 'AI_AUTH' ? 'OpenAI отклонил ключ API. Проверьте ключ в .env на сервере.'
      : problem === 'AI_QUOTA' ? 'OpenAI временно отклонил запрос из-за квоты или ограничения частоты. Проверьте баланс API и повторите позже.'
      : problem === 'AI_UNAVAILABLE' ? 'Не удалось получить ИИ-ответ. В базе research нет готового ответа на этот вопрос. Попробуйте ещё раз позже.'
      : 'В материалах research нет достаточных сведений для подтверждённого ответа на этот вопрос. Могу помочь с товарами, условиями покупки и навигацией по ekt.kz.';
    session.lastQuery = question.slice(0, 500);
    return { text, products: [], sources: [], answerMode: 'research-unavailable', aiStatus: problem };
  }
  async prepare(session, sku, quantity) {
    session.proposal = null;
    const p = this.catalog.live ? await this.catalog.refresh(sku) : this.catalog.get(sku);
    if (!p) fail(404, 'Товар не найден.');
    if (stockOf(p) === null || p.price === null) fail(409, 'Цена или наличие не подтверждены источником.');
    if (!Number.isSafeInteger(quantity) || quantity < p.minOrder || quantity > 10000) fail(400, `Минимальное количество: ${p.minOrder} ${p.unit}. Укажите целое число до 10 000.`);
    const available = stockOf(p);
    if (quantity > available) fail(409, `В наличии ${Math.max(0, available)} ${p.unit}. Укажите количество не больше остатка.`);
    session.proposal = { id: randomUUID(), sku, quantity, price: p.price, expires: Date.now() + 5 * 60000 };
    return { text: `Добавить ${p.name} — ${quantity} ${p.unit} на сумму ${(p.price * quantity).toLocaleString('ru-RU')} ₸? Подтвердите кнопкой или напишите «да, добавь».`, proposal: { ...session.proposal, product: p }, products: [] };
  }
  async confirm(session, id, confirmed) {
    if (confirmed !== true) fail(400, 'Нужно явное подтверждение.');
    if (session.completed.has(id)) return session.completed.get(id);
    const proposal = session.proposal;
    if (!proposal || proposal.id !== id || proposal.expires < Date.now()) fail(409, 'Предложение истекло или заменено. Выберите товар заново.');
    const p = this.catalog.live ? await this.catalog.refresh(proposal.sku) : this.catalog.get(proposal.sku);
    if (!p || stockOf(p) === null || p.price !== proposal.price || proposal.quantity > stockOf(p)) {
      session.proposal = null; fail(409, 'Цена или остаток изменились. Запросите новое предложение; корзина не изменена.');
    }
    session.proposal = null;
    const result = { text: `Подтверждена имитация добавления: ${p.name} — ${proposal.quantity} ${p.unit}. Реальная корзина ekt.kz не изменена.`, action: { id, type: 'add_to_cart', simulated: true, sku: p.sku, productId: p.id, name: p.name, quantity: proposal.quantity, unit: p.unit }, products: [] };
    session.completed.set(id, result);
    if (session.completed.size > 50) session.completed.delete(session.completed.keys().next().value);
    return result;
  }
  async chat(session, message, attachment) {
    const text = message.trim();
    if (!text && !attachment) fail(400, 'Напишите сообщение или прикрепите файл.');
    // Only exact user text can confirm. Attachment text and model output never enter this branch.
    if (/^(да[,!]?\s+добавь|подтверждаю|да,?\s+добавить)[.!]?$/iu.test(text) && !attachment) {
      if (!session.proposal) return { text: 'Сначала выберите товар и количество. Пока корзина не изменена.', products: [] };
      return this.confirm(session, session.proposal.id, true);
    }
    if (/^(нет|отмена|не добавляй)[.!]?$/iu.test(text)) { session.proposal = null; return { text: 'Добавление отменено. Корзина не изменена.', products: [] }; }
    // Any intervening request invalidates a previous confirmation context.
    session.proposal = null;
    let query = `${text}\n${attachment?.text ?? ''}`.trim();
    const exact = !attachment ? exactProductMatch(this.catalog.items, text) : null;
    const exactResponse = this.exactReply(session, text, exact);
    if (exactResponse) return exactResponse;
    const information = !attachment ? answerSiteQuestion(text, session.knowledgeTopic) : null;
    // Recognized site questions take precedence over incidental name fragments
    // (EKT PRO must not match PROLINE products via the generic catalog category).
    if (information) return this.researchReply(session, text, information);
    let matches = this.catalog.search(query);
    if (!matches.length && this.catalog.live) {
      const id = text.match(/(?:id[= :]*|товар\s+)(\d{4,8})/iu)?.[1] || text.match(/^\d{4,8}$/u)?.[0];
      if (id) { const found = await this.catalog.byId(id); if (found) matches = [found]; }
    }
    if (!attachment && matches.length === 1) {
      const opened = this.exactReply(session, text, exactProductMatch(matches, text));
      if (opened) return opened;
    }
    const quantityMatch = text.match(/(?:^|\s)(\d+)\s*(?:шт|штук|метр|м\b)/iu);
    let quantity = quantityMatch ? Number(quantityMatch[1]) : null;
    let prepare = /(добав|купи|купить|возьми|положи)/iu.test(text) && !/(не добав|не покуп|не надо|не клади)/iu.test(text);
    let note = '';
    if (!matches.length && !attachment && /^(его|этот|его характеристики|характеристики|сертификат|добавь|добавь его|добавь \d+ шт)[.!]?$/iu.test(text) && session.lastProducts.length === 1) matches = session.lastProducts.map(sku => this.catalog.get(sku)).filter(Boolean);
    if (!attachment && !matches.length) return this.researchReply(session, text, information);
    if (attachment && (!matches.length || attachment.image) && this.ai?.enabled) {
      try {
        const result = await this.ai.interpret(query, session, attachment?.image, { hasAttachment: true });
        if (result?.intent === 'conditions' && !attachment) return this.siteReply(session, text, answerSiteQuestion('Доставка и оплата'));
        if (result?.intent === 'site_info' && !attachment) {
          const urls = result.source_urls;
          const sources = Array.isArray(urls) ? resolveKnowledgeSources(urls) : [];
          if (typeof result.answer === 'string' && result.answer.trim() && result.answer.length <= 3000 && !/https?:|www\.|<\/?[a-z]/iu.test(result.answer) && urls?.length <= 4 && urls.every(url => resolveKnowledgeSources([url]).length) && sources.length) {
            return this.siteReply(session, text, { text: `${result.answer.trim()}\n\nБаза знаний проверена: ${siteKnowledge.checkedAt}. Изменяемые условия необходимо уточнить перед покупкой.`, sources, products: [] });
          }
        }
        if (result && ['search', 'prepare'].includes(result.intent)) { query = result.query; matches = this.catalog.search(query); quantity ??= result.quantity; }
      } catch { note = attachment?.image ? 'Не удалось распознать фото. Напишите маркировку или название товара. ' : ''; }
    }
    session.lastQuery = text.slice(0, 500);
    session.knowledgeTopic = null;
    if (this.catalog.live) matches = await this.catalog.detailsForSearch(query, matches);
    session.lastProducts = matches.map(p => p.sku);
    if (attachment?.image) note += 'Совпадения по фото предварительные: проверьте маркировку и характеристики. ';
    if (!matches.length) return { text: note + (attachment?.image && !this.ai?.enabled ? 'Для распознавания фото подключите OpenAI на сервере. ' : '') + (this.catalog.live ? (!this.catalog.complete ? `Каталог ещё загружается: обработано ${this.catalog.items.length} товаров. Повторите запрос после завершения загрузки — прогресс виден в окне сервера.` : 'Не нашёл совпадения. Уточните название, артикул или маркировку товара. Например: «витая пара», «кабель телефонный», «ВВГ 3х2,5».') : 'Не нашёл точного совпадения в тестовом каталоге. Укажите артикул, например DEMO-101, или название: автомат, кабель, розетка.'), products: [] };
    if (prepare && matches.length === 1 && !attachment) {
      if (quantity === null) return { text: `Какое количество ${matches[0].name} нужно? Укажите, например, «добавь 2 шт», или выберите количество в карточке.`, products: matches };
      return this.prepare(session, matches[0].sku, quantity);
    }
    const missing = matches.filter(p => stockOf(p) === 0);
    const alternatives = missing.flatMap(p => this.catalog.alternatives(p).map(x => ({ ...x, alternativeFor: p.sku })));
    return { text: note + (missing.length ? `Позиция ${missing.map(p => p.sku).join(', ')} отсутствует. ${alternatives.length ? 'Ниже — доступные аналоги с объяснением подбора.' : 'Подтверждённых аналогов в каталоге нет; для подбора нужен менеджер.'}` : `Нашёл ${matches.length === 1 ? 'товар' : 'подходящие позиции'}. Цена, наличие и характеристики — ${this.catalog.live ? 'из API ekt.kz, проверены сейчас' : 'из демонстрационного каталога'}.`), products: matches, alternatives, matchType: 'partial' };
  }
}
