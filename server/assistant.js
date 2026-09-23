import { randomUUID } from 'node:crypto';
import { conditions, stockOf } from './catalog.js';
import { purchaseConditions as liveConditions } from './conditions.js';
export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new AppError(status, message); };
export function createSession() {
  return { id: randomUUID(), readToken: randomUUID(), cart: {}, proposal: null, completed: new Map(), lastProducts: [], aiCalls: 0, expires: Date.now() + 2 * 3600000, busy: false };
}
export class Assistant {
  constructor(catalog, ai) { this.catalog = catalog; this.ai = ai; }
  cart(session) {
    const items = Object.entries(session.cart).map(([sku, quantity]) => ({ ...this.catalog.get(sku), quantity }));
    return { items, total: items.reduce((n, p) => n + p.price * p.quantity, 0), currency: 'KZT', demo: true };
  }
  async prepare(session, sku, quantity) {
    session.proposal = null;
    const p = this.catalog.live ? await this.catalog.refresh(sku) : this.catalog.get(sku);
    if (!p) fail(404, 'Товар не найден.');
    if (stockOf(p) === null || p.price === null) fail(409, 'Цена или наличие не подтверждены источником.');
    if (!Number.isSafeInteger(quantity) || quantity < p.minOrder || quantity > 10000) fail(400, `Минимальное количество: ${p.minOrder} ${p.unit}. Укажите целое число до 10 000.`);
    const available = stockOf(p) - (session.cart[sku] || 0);
    if (quantity > available) fail(409, `Можно добавить ещё ${Math.max(0, available)} ${p.unit}. Корзина не изменена.`);
    session.proposal = { id: randomUUID(), sku, quantity, price: p.price, expires: Date.now() + 5 * 60000 };
    return { text: `Добавить ${p.name} — ${quantity} ${p.unit} на сумму ${(p.price * quantity).toLocaleString('ru-RU')} ₸? Подтвердите кнопкой или напишите «да, добавь».`, proposal: { ...session.proposal, product: p }, products: [] };
  }
  async confirm(session, id, confirmed) {
    if (confirmed !== true) fail(400, 'Нужно явное подтверждение.');
    if (session.completed.has(id)) return session.completed.get(id);
    const proposal = session.proposal;
    if (!proposal || proposal.id !== id || proposal.expires < Date.now()) fail(409, 'Предложение истекло или заменено. Выберите товар заново.');
    const p = this.catalog.live ? await this.catalog.refresh(proposal.sku) : this.catalog.get(proposal.sku);
    if (!p || stockOf(p) === null || p.price !== proposal.price || (session.cart[p.sku] || 0) + proposal.quantity > stockOf(p)) {
      session.proposal = null; fail(409, 'Цена или остаток изменились. Запросите новое предложение; корзина не изменена.');
    }
    session.cart[p.sku] = (session.cart[p.sku] || 0) + proposal.quantity;
    session.proposal = null;
    const result = { text: `Добавлено в демонстрационную корзину: ${p.name} — ${proposal.quantity} ${p.unit}.`, cart: this.cart(session), cartPath: `/cart.html#${session.readToken}`, products: [] };
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
    const purchaseConditions = this.catalog.live ? liveConditions : { text: conditions };
    if (/(оплат|достав|минимальн|условия покуп|самовывоз)/iu.test(text) && !attachment) return { ...purchaseConditions, products: [] };
    let matches = this.catalog.search(query);
    if (!matches.length && this.catalog.live) {
      const id = text.match(/(?:id[= :]*|товар\s+)(\d{4,8})/iu)?.[1] || text.match(/^\d{4,8}$/u)?.[0];
      if (id) { const found = await this.catalog.byId(id); if (found) matches = [found]; }
    }
    const quantityMatch = text.match(/(?:^|\s)(\d+)\s*(?:шт|штук|метр|м\b)/iu);
    let quantity = quantityMatch ? Number(quantityMatch[1]) : null;
    let prepare = /(добав|купи|купить|корзин|возьми)/iu.test(text) && !/(не добав|не покуп|не надо)/iu.test(text);
    let note = '';
    if (!matches.length && !attachment && /^(его|этот|его характеристики|характеристики|сертификат|добавь|добавь его|добавь \d+ шт)[.!]?$/iu.test(text) && session.lastProducts.length === 1) matches = session.lastProducts.map(sku => this.catalog.get(sku)).filter(Boolean);
    if ((!matches.length || attachment?.image) && this.ai?.enabled) {
      try {
        const result = await this.ai.interpret(query, session, attachment?.image);
        if (result?.intent === 'conditions') return { ...purchaseConditions, products: [] };
        if (result) { query = result.query; matches = this.catalog.search(query); quantity ??= result.quantity; prepare ||= result.intent === 'prepare' && !attachment; }
      } catch { note = 'ИИ сейчас недоступен или достигнут лимит расходов. Используйте артикул или название. '; }
    }
    session.lastQuery = text.slice(0, 500);
    if (this.catalog.live) matches = await Promise.all(matches.slice(0, 4).map(p => this.catalog.refresh(p.sku)));
    session.lastProducts = matches.map(p => p.sku);
    if (attachment?.image) note += 'Совпадения по фото предварительные: проверьте маркировку и характеристики. ';
    if (!matches.length) return { text: note + (attachment?.image && !this.ai?.enabled ? 'Для распознавания фото подключите OpenAI на сервере. ' : '') + (this.catalog.live ? 'Не нашёл совпадения в загруженной части каталога. Попробуйте ID товара, например 515291. Это не означает, что товара нет на сайте.' : 'Не нашёл точного совпадения в тестовом каталоге. Укажите артикул, например DEMO-101, или название: автомат, кабель, розетка.'), products: [] };
    if (prepare && matches.length === 1 && !attachment) {
      if (quantity === null) return { text: `Какое количество ${matches[0].name} нужно? Укажите, например, «добавь 2 шт», или выберите количество в карточке.`, products: matches };
      return this.prepare(session, matches[0].sku, quantity);
    }
    const missing = matches.filter(p => stockOf(p) === 0);
    const alternatives = missing.flatMap(p => this.catalog.alternatives(p).map(x => ({ ...x, alternativeFor: p.sku })));
    return { text: note + (missing.length ? `Позиция ${missing.map(p => p.sku).join(', ')} отсутствует. ${alternatives.length ? 'Ниже — доступные аналоги с объяснением подбора.' : 'Подтверждённых аналогов в каталоге нет; для подбора нужен менеджер.'}` : `Нашёл ${matches.length === 1 ? 'товар' : 'подходящие позиции'}. Цена, наличие и характеристики — ${this.catalog.live ? 'из API ekt.kz, проверены сейчас' : 'из демонстрационного каталога'}.`), products: matches, alternatives };
  }
}
