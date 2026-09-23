import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const widgetSource = readFileSync(new URL('../../extension/widget.js', import.meta.url), 'utf8');

// Only the DOM operations used by the widget are needed to exercise its real handlers.
export class Element {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.disabled = false; this.value = ''; this.className = ''; this.ownText = ''; }
  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.ownText = ''; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  setAttribute(name, value) { if (name === 'id') this.id = value; else if (name === 'class') this.className = value; else this[name] = value; }
  focus() {}
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('[data-query')) { const value = selector.match(/="([^"]+)"/); return this.dataset.query !== undefined && (!value || this.dataset.query === value[1]); }
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return descendants;
    return descendants.filter(element => selector.split(',').some(part => {
      const chain = part.trim().split(/\s+/);
      if (!element.matches(chain.pop())) return false;
      let ancestor = element.parentNode;
      while (chain.length) {
        const next = chain.pop();
        while (ancestor && !ancestor.matches(next)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    }));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

export const healthy = { data: { ai: true, mode: 'live', count: 15037, complete: true }, serverURL: 'http://localhost:8787' };
export const flush = () => new Promise(resolve => setImmediate(resolve));

export async function setup(handler = () => healthy, { missingChrome = false, onAlert = () => assert.fail('Unexpected cart alert.') } = {}) {
  const document = new Element('document');
  document.createElement = tag => new Element(tag);
  document.getElementById = id => document.querySelector(`#${id}`);
  for (const id of ['messages', 'composer', 'message', 'send', 'reset', 'file', 'file-preview', 'connection', 'mode-note']) {
    const element = new Element(id === 'message' ? 'textarea' : ['send', 'reset'].includes(id) ? 'button' : 'div'); element.id = id; document.append(element);
  }
  for (const query of ['Покажи товар 515291', 'Нужен аналог DEMO-102']) { const button = new Element('button'); button.dataset.query = query; document.append(button); }
  const calls = [];
  let reloads = 0;
  const context = vm.createContext({
    document, URL, AbortSignal, console,
    location: { protocol: 'chrome-extension:', origin: 'chrome-extension://test', reload: () => { reloads++; } },
    chrome: missingChrome ? undefined : { runtime: { id: 'test', sendMessage: message => { calls.push(message); return handler(message); } } },
    window: { alert: onAlert },
  });
  vm.runInContext(widgetSource, context, { filename: 'extension/widget.js' });
  await flush();
  return { context, document, calls, reloads: () => reloads, get: selector => document.querySelector(selector) };
}

