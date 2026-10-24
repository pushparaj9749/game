// Headless smoke test: stubs DOM + canvas so the full game loop can run in Node.
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
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, f) { if (f === undefined) this.contains(c) ? this.s.delete(c) : this.s.add(c); else f ? this.add(c) : this.remove(c); }
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

const ids = {};
const document = {
  getElementById(id) {
    if (!ids[id]) ids[id] = new El(id);
    return ids[id];
  },
  createElement(tag) { return new El('', tag); },
  addEventListener(t) { (listeners[t] ||= []).push(arguments[1]); },
};
// zone label needs a parent with classList
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
globalThis.performance = performance;

const _i0 = Date.now();
await import('/home/user/game/src/main.js');
await import('/home/user/game/src/audio.js');

// fire the load handler -> creates game
for (const fn of listeners.load || []) fn();
const game = win.game;
if (!game) throw new Error('game did not init');

const _s0 = Date.now();
game.start();
const _dmg = game.damageFighter.bind(game);
game._hits = [];
game.damageFighter = (t, amt, from, ang) => { if (t.isPlayer) game._hits.push({t: game.time.toFixed(2), amt: Math.round(amt), from: from ? from.name : 'zone', w: from ? from.weaponKey : '-', d: from ? Math.round(Math.hypot(from.x-t.x, from.y-t.y)) : 0}); return _dmg(t, amt, from, ang); };
console.log('start ms', Date.now()-_s0, 'import ms', _s0-_i0);
console.log('started. bots', game.bots.length, 'pickups', game.pickups.length, 'lootSpots', game.world.lootSpots.length);

const keys = new Set();
game.input.keys = keys;
let kills = 0;
let maxBullets = 0;
let frames = 0;
let loopStart = Date.now();
let lastLog = Date.now();
const LOOP_N = Number(process.env.N || 1200);
for (let i = 0; i < LOOP_N; i++) {

  // wander around and shoot periodically
  const phase = Math.floor(i / 120) % 4;
  keys.clear();
  if (phase === 0) keys.add('KeyW');
  if (phase === 1) keys.add('KeyD');
  if (phase === 2) keys.add('KeyS');
  if (phase === 3) keys.add('KeyA');
  if (i % 600 < 300) keys.add('ShiftLeft');
  game.input.mouse.x = 800 + Math.sin(i / 40) * 200;
  game.input.mouse.y = 400 + Math.cos(i / 40) * 200;
  game.input.mouseDown = i % 37 < 12;
  game.input.aimAngle = Math.atan2(game.input.mouse.y - 360, game.input.mouse.x - 640);
  game.update(1 / 60);
  game.render(1 / 60);

  frames++;
  if (game.bullets.length > maxBullets) maxBullets = game.bullets.length;
  if (i % 900 === 0 && i) {
    console.log(`t=${game.time.toFixed(1)}s alive=${game.aliveCount()} hp=${game.player.hp.toFixed(0)} sh=${game.player.shield.toFixed(0)} kills=${game.player.kills} bullets=${game.bullets.length} parts=${game.particles.length} zoneR=${game.zone.radius.toFixed(0)} state=${game.state} pickups=${game.pickups.length}`);
  }
  if (game.state === 'over' && game.endShown) {
    console.log('GAME OVER at t=' + game.time.toFixed(1) + ' won=' + game.won + ' place=' + game.finalPlace + ' botKills=' + game.player.kills);
    break;
  }
}
const dtMs = 0;
console.log('frames', frames, 'maxBullets', maxBullets);
process.exit(0);
