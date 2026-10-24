export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
export const angleDiff = (a, b) => {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return d;
};
export const lerpAngle = (a, b, t) => a + angleDiff(a, b) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** circle vs axis aligned rect overlap resolution. returns push vector or null */
export function circleRectResolve(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  let dx = cx - nx;
  let dy = cy - ny;
  let d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return { x: (dx / d) * push, y: (dy / d) * push };
  }
  // center inside rect: push out along smallest axis
  const left = cx - rx;
  const right = rx + rw - cx;
  const top = cy - ry;
  const bottom = ry + rh - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: -(left + r), y: 0 };
  if (m === right) return { x: right + r, y: 0 };
  if (m === top) return { x: 0, y: -(top + r) };
  return { x: 0, y: bottom + r };
}

export function segCircleHit(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-6) t = clamp(((cx - x1) * dx + (cy - y1) * dy) / len2, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return (cx - px) * (cx - px) + (cy - py) * (cy - py) <= r * r;
}

export function segRectHit(x1, y1, x2, y2, rx, ry, rw, rh) {
  // Liang-Barsky style slab test
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

export class SpatialGrid {
  constructor(cell, w, h) {
    this.cell = cell;
    this.cols = Math.ceil(w / cell);
    this.rows = Math.ceil(h / cell);
    this.map = new Map();
  }
  key(cx, cy) {
    return cx + cy * 100000;
  }
  insert(obj, r) {
    const c = this.cell;
    const x0 = Math.floor((obj.x - r) / c);
    const x1 = Math.floor((obj.x + r) / c);
    const y0 = Math.floor((obj.y - r) / c);
    const y1 = Math.floor((obj.y + r) / c);
    for (let cy = Math.max(0, y0); cy <= Math.min(this.rows - 1, y1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(this.cols - 1, x1); cx++) {
        const k = this.key(cx, cy);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(obj);
      }
    }
  }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c);
    const y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.map.get(this.key(cx, cy));
        if (list) for (let i = 0; i < list.length; i++) if (out.indexOf(list[i]) === -1) out.push(list[i]);
      }
    }
    return out;
  }
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + String(r).padStart(2, '0');
}
