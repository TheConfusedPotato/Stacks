/**
 * test-helper.js
 *
 * Mock environment and test fixtures for Node.js native test runner.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createMockStorage(initialData = {}) {
  const store = { ...initialData };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? String(store[key]) : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    _raw: store,
  };
}

function parseAttributes(attrsStr) {
  const attrs = {};
  if (!attrsStr) return attrs;
  const regex = /([a-zA-Z0-9\-:]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = regex.exec(attrsStr)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs[key] = val;
  }
  return attrs;
}

function parseHTMLToElements(html) {
  if (!html) return [];
  const root = createMockElement('div');
  const stack = [root];
  const tagRegex = /<\/?([a-zA-Z0-9\-]+)([^>]*)>|([^<]+)/g;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const [full, tag, attrsStr, text] = match;
    if (text) {
      const trimmed = text.trim();
      if (trimmed) {
        const textNode = createMockElement('span', { textContent: trimmed });
        stack[stack.length - 1].appendChild(textNode);
      }
      continue;
    }
    if (full.startsWith('</')) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = parseAttributes(attrsStr);
    if (attrs.class) attrs.className = attrs.class;
    const el = createMockElement(tag, attrs);
    stack[stack.length - 1].appendChild(el);

    const isSelfClosing = full.endsWith('/>') || ['input', 'img', 'br', 'hr', 'meta', 'link'].includes(tag.toLowerCase());
    if (!isSelfClosing) {
      stack.push(el);
    }
  }
  return root.children;
}

function matchesSingle(el, sel) {
  sel = sel.trim();
  if (sel === '*' || sel === '') return true;

  if (sel === ':last-child') {
    if (!el.parentNode || !el.parentNode.children) return true;
    const siblings = el.parentNode.children;
    return siblings[siblings.length - 1] === el;
  }
  if (sel === ':first-child') {
    if (!el.parentNode || !el.parentNode.children) return true;
    return el.parentNode.children[0] === el;
  }

  if (sel.includes(':last-child')) {
    const base = sel.replace(':last-child', '');
    return matchesSingle(el, base) && matchesSingle(el, ':last-child');
  }
  if (sel.includes(':first-child')) {
    const base = sel.replace(':first-child', '');
    return matchesSingle(el, base) && matchesSingle(el, ':first-child');
  }

  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=');
      const cleanVal = val.replace(/['"]/g, '');
      return el.getAttribute(attr.trim()) === cleanVal;
    }
    return el.getAttribute(inner.trim()) !== null;
  }

  if (sel.includes('[') && sel.endsWith(']')) {
    const tag = sel.substring(0, sel.indexOf('['));
    const attrPart = sel.substring(sel.indexOf('['));
    return matchesSingle(el, tag) && matchesSingle(el, attrPart);
  }

  if (sel.startsWith('#')) {
    const id = sel.slice(1);
    return el.id === id || el.getAttribute('id') === id;
  }

  if (sel.startsWith('.')) {
    return el.classList.contains(sel.slice(1));
  }

  if (sel.includes('.')) {
    const [tag, ...classes] = sel.split('.');
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    return classes.every((c) => el.classList.contains(c));
  }
  if (sel.includes('#')) {
    const [tag, id] = sel.split('#');
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    return el.id === id || el.getAttribute('id') === id;
  }

  return el.tagName.toLowerCase() === sel.toLowerCase();
}

function matchesSelector(el, sel) {
  sel = sel.trim();
  if (sel.includes(',')) {
    return sel.split(',').some((part) => matchesSelector(el, part.trim()));
  }

  if (sel.includes(' ')) {
    const parts = sel.split(/\s+/);
    let curr = el;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (i === parts.length - 1) {
        if (!matchesSingle(curr, part)) return false;
      } else {
        let parent = curr.parentNode;
        let matched = false;
        while (parent) {
          if (matchesSingle(parent, part)) {
            matched = true;
            curr = parent;
            break;
          }
          parent = parent.parentNode;
        }
        if (!matched) return false;
      }
    }
    return true;
  }

  return matchesSingle(el, sel);
}

function findInTree(root, sel, single = false) {
  const results = [];
  function walk(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
      if (matchesSelector(child, sel)) {
        results.push(child);
        if (single) return;
      }
      walk(child);
      if (single && results.length > 0) return;
    }
  }
  walk(root);
  return single ? results[0] || null : results;
}

function createMockElement(tagName = 'div', attrs = {}) {
  const listeners = {};
  const children = [];
  const attributes = { ...attrs };

  let textContentStore = attrs.textContent !== undefined ? String(attrs.textContent) : '';
  let innerHtmlStore = attrs.innerHTML !== undefined ? String(attrs.innerHTML) : '';

  const el = {
    tagName: tagName.toUpperCase(),
    id: attrs.id || '',
    value: attrs.value || '',
    get textContent() {
      if (textContentStore !== '') return textContentStore;
      if (children.length === 0) return '';
      return children.map((c) => c.textContent).join('');
    },
    set textContent(val) {
      textContentStore = String(val);
      children.length = 0;
    },
    get innerHTML() {
      return innerHtmlStore;
    },
    set innerHTML(val) {
      innerHtmlStore = String(val);
      textContentStore = '';
      children.length = 0;
      const parsed = parseHTMLToElements(val);
      for (const c of parsed) {
        el.appendChild(c);
      }
    },
    href: attrs.href || '',
    type: attrs.type || '',
    disabled: attrs.disabled || false,
    checked: attrs.checked || false,
    style: {
      ...attrs.style,
      setProperty(p, v) {
        this[p] = v;
      },
      getPropertyValue(p) {
        return this[p] || '';
      },
    },
    attributes,
    getAttribute(name) {
      if (name === 'id') return el.id || attributes.id || null;
      if (name === 'value') return el.value || attributes.value || null;
      if (name === 'href') return el.href || attributes.href || null;
      if (name === 'class') return el.className || attributes.class || null;
      return attributes[name] !== undefined ? String(attributes[name]) : null;
    },
    setAttribute(name, val) {
      const s = String(val);
      attributes[name] = s;
      if (name === 'id') el.id = s;
      if (name === 'value') el.value = s;
      if (name === 'href') el.href = s;
      if (name === 'class') {
        el.className = s;
        el.classList._classes = new Set(s.split(' ').filter(Boolean));
      }
    },
    removeAttribute(name) {
      delete attributes[name];
      if (name === 'id') el.id = '';
      if (name === 'class') {
        el.className = '';
        el.classList._classes.clear();
      }
    },
    addEventListener(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
    },
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const evtObj = typeof event === 'string' ? { type, preventDefault() {}, defaultPrevented: false } : event;
      if (!evtObj.preventDefault) evtObj.preventDefault = function () { this.defaultPrevented = true; };
      if (listeners[type]) {
        for (const fn of listeners[type]) fn(evtObj);
      }
    },
    appendChild(child) {
      if (!child) return child;
      children.push(child);
      child.parentNode = el;
      return child;
    },
    insertBefore(newChild, refChild) {
      if (!newChild) return newChild;
      const idx = refChild ? children.indexOf(refChild) : -1;
      if (idx !== -1) {
        children.splice(idx, 0, newChild);
      } else {
        children.push(newChild);
      }
      newChild.parentNode = el;
      return newChild;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    remove() {
      if (el.parentNode && el.parentNode.children) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx !== -1) el.parentNode.children.splice(idx, 1);
      }
    },
    querySelector(sel) {
      return findInTree(el, sel, true);
    },
    querySelectorAll(sel) {
      return findInTree(el, sel, false);
    },
    children,
  };

  let _className = attrs.className || attrs.class || '';
  const _classesSet = new Set(_className.split(' ').filter(Boolean));

  el.classList = {
    _classes: _classesSet,
    add(c) {
      this._classes.add(c);
      _className = Array.from(this._classes).join(' ');
    },
    remove(c) {
      this._classes.delete(c);
      _className = Array.from(this._classes).join(' ');
    },
    toggle(c) {
      if (this._classes.has(c)) this._classes.delete(c);
      else this._classes.add(c);
      _className = Array.from(this._classes).join(' ');
    },
    contains(c) {
      return this._classes.has(c);
    },
  };

  Object.defineProperty(el, 'className', {
    get() {
      return _className;
    },
    set(val) {
      _className = String(val || '');
      el.classList._classes = new Set(_className.split(' ').filter(Boolean));
    },
    configurable: true,
  });

  return el;
}

function createMockNotification() {
  const instances = [];
  class MockNotification {
    constructor(title, options = {}) {
      this.title = title;
      this.options = options;
      this.body = options.body || '';
      this.tag = options.tag || '';
      MockNotification.instances.push(this);
    }
    static permission = 'default';
    static instances = instances;
    static requestPermission(cb) {
      MockNotification.permission = 'granted';
      if (typeof cb === 'function') cb('granted');
      return Promise.resolve('granted');
    }
    static reset() {
      MockNotification.instances.length = 0;
      MockNotification.permission = 'default';
    }
  }
  return MockNotification;
}

function createMockAudioContext() {
  const audioEvents = [];
  const instances = [];
  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
      MockAudioContext.instances.push(this);
    }
    static instances = instances;
    static audioEvents = audioEvents;
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: {
          setValueAtTime: (val, t) => { osc._freq = val; },
        },
        connect: (dest) => {},
        start: (t) => { MockAudioContext.audioEvents.push({ type: 'start', freq: osc._freq, time: t }); },
        stop: (t) => { MockAudioContext.audioEvents.push({ type: 'stop', time: t }); },
      };
      return osc;
    }
    createGain() {
      const gain = {
        gain: {
          setValueAtTime: (val, t) => {},
          exponentialRampToValueAtTime: (val, t) => {},
        },
        connect: (dest) => {},
      };
      return gain;
    }
    static reset() {
      MockAudioContext.audioEvents.length = 0;
      MockAudioContext.instances.length = 0;
    }
  }
  return MockAudioContext;
}

function setupMockEnvironment(options = {}) {
  const mockStorage = createMockStorage(options.initialStorage || {});
  global.localStorage = mockStorage;

  const pathname = options.pathname || '/dashboard.html';
  const search = options.search || '';

  const MockNotification = createMockNotification();
  const MockAudioContext = createMockAudioContext();

  global.window = {
    location: {
      pathname,
      search,
      href: `http://localhost:8000${pathname}${search}`,
      replace(url) {
        this.href = url;
      },
    },
    Notification: MockNotification,
    AudioContext: MockAudioContext,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  global.Notification = MockNotification;
  global.AudioContext = MockAudioContext;

  // Wrap timers to unref automatically in test runs
  const origSetInterval = global.setInterval;
  global.setInterval = function (fn, delay, ...args) {
    const t = origSetInterval(fn, delay, ...args);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };
  const origSetTimeout = global.setTimeout;
  global.setTimeout = function (fn, delay, ...args) {
    const t = origSetTimeout(fn, delay, ...args);
    if (t && typeof t.unref === 'function') t.unref();
    return t;
  };

  const body = createMockElement('body');

  global.document = {
    readyState: 'complete',
    title: 'Stacks',
    body,
    addEventListener: () => {},
    querySelector: (sel) => findInTree(body, sel, true),
    querySelectorAll: (sel) => findInTree(body, sel, false),
    getElementById: (id) => findInTree(body, `#${id}`, true),
    createElement: (tag) => createMockElement(tag),
  };

  return { mockStorage, window: global.window, document: global.document, MockNotification, MockAudioContext };
}

function loadScripts(scriptNames = []) {
  const scriptsDir = path.resolve(__dirname, '../scripts');
  for (const name of scriptNames) {
    const filePath = path.join(scriptsDir, name);
    const code = fs.readFileSync(filePath, 'utf8');
    vm.runInThisContext(code);
  }
}

module.exports = {
  createMockStorage,
  createMockElement,
  setupMockEnvironment,
  loadScripts,
  createMockNotification,
  createMockAudioContext,
};
