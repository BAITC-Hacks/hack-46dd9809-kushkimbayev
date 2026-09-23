import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Element } from './helpers/widget-ui.js';

const source = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8');

function setup() {
  let shadow, runtimeHandler;
  const events = new Map();
  class WindowElement extends Element {
    constructor(tag) {
      super(tag); this.style = {}; this.contentWindow = {}; this.captures = new Set();
      this.classList = {
        add: value => { this.className = [...new Set([...this.className.split(/\s+/), value])].join(' '); },
        remove: value => { this.className = this.className.split(/\s+/).filter(item => item !== value).join(' '); },
      };
    }
    attachShadow() { shadow = new WindowElement('shadow'); return shadow; }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector); }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
  }
  const document = new WindowElement('document');
  document.documentElement = document;
  document.createElement = tag => new WindowElement(tag);
  document.getElementById = id => document.querySelector(`#${id}`);
  const context = vm.createContext({
    document, innerWidth: 1280, innerHeight: 900,
    window: { addEventListener: (type, listener) => events.set(type, listener) },
    getComputedStyle: () => ({ opacity: '1', transform: 'none' }),
    matchMedia: () => ({ matches: true }),
    chrome: { runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: { addListener: listener => { runtimeHandler = listener; } } } },
  });
  vm.runInContext(source, context);
  return { context, document, events, runtime: (...args) => runtimeHandler(...args), get: selector => shadow.querySelector(selector) };
}

const pointer = (target, values = {}) => ({ target, pointerId: 1, button: 0, clientX: 0, clientY: 0, preventDefault() {}, ...values });
const key = value => ({ key: value, preventDefault() {} });
const bounds = panel => Object.fromEntries(['left', 'top', 'width', 'height'].map(name => [name, parseFloat(panel.style[name])]));

test('designed window opens embedded widget, restores size, and stays inside resized viewport', () => {
  const ui = setup(), panel = ui.get('.panel'), launcher = ui.get('.launcher');
  assert.equal(ui.get('iframe').src, 'chrome-extension://test/widget.html?embedded=1');
  assert.equal(panel.hidden, true);
  launcher.onclick();
  assert.equal(panel.hidden, false);
  assert.equal(launcher['aria-expanded'], 'true');
  const initial = bounds(panel);
  assert.deepEqual(initial, { left: 696, top: 28, width: 560, height: 780 });
  ui.get('.expand').onclick();
  assert.deepEqual(bounds(panel), { left: 90, top: 16, width: 1100, height: 868 });
  ui.get('.expand').onclick();
  assert.deepEqual(bounds(panel), initial);
  ui.context.innerWidth = 375; ui.context.innerHeight = 667;
  ui.events.get('resize')();
  const mobile = bounds(panel);
  assert.ok(mobile.left >= 8 && mobile.left + mobile.width <= 367);
  assert.ok(mobile.top >= 8 && mobile.top + mobile.height <= 659);
  launcher.onclick();
  assert.equal(panel.hidden, true); assert.equal(panel.inert, true);
});

test('drag and keyboard resize move the live window within bounds without swallowing controls', () => {
  const ui = setup(), panel = ui.get('.panel'), bar = ui.get('.bar'), resize = ui.get('.resize-handle');
  ui.get('.launcher').onclick();
  bar.onpointerdown(pointer(ui.get('.expand')));
  bar.onpointermove(pointer(bar, { clientX: -500 }));
  assert.equal(bounds(panel).left, 696, 'expand button cannot initiate a drag');
  bar.onpointerdown(pointer(ui.get('.drag')));
  bar.onpointermove(pointer(bar, { clientX: -1000, clientY: -500 }));
  assert.equal(bounds(panel).left, 8); assert.equal(bounds(panel).top, 8);
  bar.onpointerup(pointer(bar));
  assert.equal(bar.hasPointerCapture(1), false);
  assert.equal(panel.className.includes('is-interacting'), false);
  ui.get('.drag').onkeydown(key('ArrowRight'));
  assert.equal(bounds(panel).left, 32);
  resize.onkeydown(key('ArrowRight'));
  assert.equal(bounds(panel).width, 584);
  resize.onpointerdown(pointer(resize));
  resize.onpointermove(pointer(resize, { clientX: 4000, clientY: 4000 }));
  const changed = bounds(panel);
  assert.ok(changed.left + changed.width <= 1272);
  assert.ok(changed.top + changed.height <= 892);
  resize.onpointercancel(pointer(resize));
  assert.equal(panel.className.includes('is-interacting'), false);
});

test('only this extension can open the shell and only the embedded widget can close it', () => {
  const ui = setup(), panel = ui.get('.panel'), frame = ui.get('iframe');
  ui.runtime({ type: 'ekt-assistant-open' }, { id: 'another-extension' }, () => assert.fail('Unauthorized reply'));
  assert.equal(panel.hidden, true);
  let opened;
  ui.runtime({ type: 'ekt-assistant-open' }, { id: 'test' }, result => { opened = result.opened; });
  assert.equal(opened, true); assert.equal(panel.hidden, false);
  const message = ui.events.get('message');
  message({ source: frame.contentWindow, origin: 'https://ekt.kz', data: { type: 'ekt-assistant-close' } });
  message({ source: {}, origin: 'chrome-extension://test', data: { type: 'ekt-assistant-close' } });
  assert.equal(panel.hidden, false);
  message({ source: frame.contentWindow, origin: 'chrome-extension://test', data: { type: 'ekt-assistant-close' } });
  assert.equal(panel.hidden, true);
  vm.runInContext(source, ui.context);
  assert.equal(ui.document.querySelectorAll('#ekt-assistant-host').length, 1);
});
