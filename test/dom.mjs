// Minimal DOM + canvas stubs so the game can run headless in Node.
const listeners = {};

function gradientStub() {
  return { addColorStop() {} };
}

function ctxStub() {
  const target = {
    canvas: { width: 1280, height: 720 },
    measureText: () => ({ width: 10 }),
    createLinearGradient: gradientStub,
    createRadialGradient: gradientStub,
    createPattern: () => ({}),
    getImageData: () => ({ data: [] }),
    setTransform() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    rect() {}, roundRect() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    drawImage() {}, setLineDash() {}, createImageData() {},
  };
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, f) {
    if (f === undefined) this.contains(c) ? this.s.delete(c) : this.s.add(c);
    else f ? this.add(c) : this.remove(c);
  }
}

class El {
  constructor(id = '', tag = 'div') {
    this.id = id;
    this.tag = tag;
    this.classList = new ClassList();
    this.style = {};
    this.textContent = '';
    this.innerHTML = '';
    this.children = [];
    this.value = 'PLAYER';
    this.width = 200;
    this.height = 200;
    this.clientWidth = 1280;
    this.clientHeight = 720;
    this._ctx = ctxStub();
    this.parentElement = null;
  }
  getContext() { return this._ctx; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  get firstChild() { return this.children[0] || null; }
  querySelector() { return new El('sub'); }
  addEventListener() {}
}

export function installDom() {
  const ids = {};
  const document = {
    getElementById(id) {
      if (!ids[id]) ids[id] = new El(id);
      return ids[id];
    },
    createElement(tag) { return new El('', tag); },
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
  };
  document.getElementById('zoneLabel').parentElement = document.getElementById('zoneChip');

  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener(t, fn) { (listeners[t] ||= []).push(fn); },
    removeEventListener() {},
  };
  globalThis.window = win;
  globalThis.document = document;
  globalThis.requestAnimationFrame = () => 0;
  return { win, listeners };
}

export async function bootGame() {
  const { win, listeners } = installDom();
  await import('../src/main.js');
  for (const fn of listeners.load || []) fn();
  if (!win.game) throw new Error('game did not init');
  return win.game;
}

export function clearTimers() {
  // prevent node from hanging on killfeed/hint timers
  const orig = setTimeout;
  globalThis.setTimeout = (fn, ms) => orig(fn, Math.min(ms, 5));
}
