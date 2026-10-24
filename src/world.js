import { WORLD_SIZE, DISTRICTS } from './config.js';
import { SpatialGrid, circleRectResolve, rand, randInt, pick, clamp, segRectHit, dist } from './utils.js';

export class World {
  constructor(seed = 1234) {
    // simple deterministic-ish random using Math.random seeded by caller mutation
    this.size = WORLD_SIZE;
    this.obstacles = [];
    this.floors = [];
    this.roads = [];
    this.trees = [];
    this.bushes = [];
    this.districts = [];
    this.lootSpots = [];
    this.decor = [];
    this.grid = new SpatialGrid(220, this.size, this.size);
    this._q = [];
    this._build();
  }

  addRect(x, y, w, h, kind, opts = {}) {
    const o = {
      shape: 'rect', x, y, w, h, kind,
      solid: opts.solid !== false,
      blocksBullets: opts.blocksBullets !== false,
      tall: opts.tall || false,
    };
    this.obstacles.push(o);
    this.grid.insert({ x: x + w / 2, y: y + h / 2, ref: o }, Math.max(w, h) / 2 + 8);
    return o;
  }

  addCircle(x, y, r, kind, opts = {}) {
    const o = {
      shape: 'circle', x, y, r, kind,
      solid: opts.solid !== false,
      blocksBullets: opts.blocksBullets !== false,
    };
    this.obstacles.push(o);
    this.grid.insert({ x, y, ref: o }, r + 8);
    return o;
  }

  _build() {
    const S = this.size;
    // ---- districts (3x3 grid of zones) ----
    const names = [...DISTRICTS].sort(() => Math.random() - 0.5);
    const cols = 3;
    const cell = S / cols;
    for (let gy = 0; gy < cols; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        this.districts.push({
          name: names[(gy * cols + gx) % names.length],
          x: gx * cell,
          y: gy * cell,
          w: cell,
          h: cell,
          cx: gx * cell + cell / 2,
          cy: gy * cell + cell / 2,
        });
      }
    }

    // ---- roads ----
    for (let i = 0; i < cols; i++) {
      const y = i * cell + cell / 2 + rand(-40, 40);
      this.roads.push({ x: 0, y: y - 34, w: S, h: 68 });
      const x = i * cell + cell / 2 + rand(-40, 40);
      this.roads.push({ x: x - 34, y: 0, w: 68, h: S });
    }

    // ---- buildings ----
    for (const d of this.districts) {
      const count = randInt(2, 4);
      const used = [];
      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 24; tries++) {
          const bw = rand(240, 420);
          const bh = rand(200, 340);
          const bx = d.x + rand(80, d.w - bw - 80);
          const by = d.y + rand(80, d.h - bh - 80);
          const rect = { x: bx, y: by, w: bw, h: bh };
          if (used.some((u) => this._overlap(u, rect, 90))) continue;
          used.push(rect);
          this._makeBuilding(rect);
          break;
        }
      }
      // scattered cover around district
      for (let i = 0; i < 26; i++) {
        const x = d.x + rand(60, d.w - 60);
        const y = d.y + rand(60, d.h - 60);
        const t = Math.random();
        if (t < 0.42) {
          const r = rand(20, 34);
          this.addCircle(x, y, r, 'rock');
        } else if (t < 0.6) {
          this.addRect(x, y, rand(46, 74), rand(46, 74), 'crate');
        }
      }
    }

    // ---- forest clusters ----
    for (let i = 0; i < 400; i++) {
      const x = rand(60, S - 60);
      const y = rand(60, S - 60);
      if (this._insideAnyBuilding(x, y, 40)) continue;
      if (this._nearRoad(x, y, 46)) continue;
      if (this._blocked(x, y, 32)) continue;
      const r = rand(22, 30);
      this.addCircle(x, y, r, 'tree');
      this.trees.push({ x, y, r: r * rand(2.4, 3.3), seed: Math.random() * 1000, tint: rand(-1, 1) });
    }

    // ---- bushes (soft cover, don't block bullets) ----
    for (let i = 0; i < 260; i++) {
      const x = rand(60, S - 60);
      const y = rand(60, S - 60);
      if (this._blocked(x, y, 40)) continue;
      const r = rand(34, 58);
      this.bushes.push({ x, y, r, seed: Math.random() * 1000 });
    }

    // ---- loot spots ----
    for (const f of this.floors) {
      const n = randInt(1, 3);
      for (let i = 0; i < n; i++) {
        this.lootSpots.push({
          x: f.x + rand(40, f.w - 40),
          y: f.y + rand(40, f.h - 40),
          district: f.district,
        });
      }
    }
    // crates give loot too
    for (const o of this.obstacles) {
      if (o.kind === 'crate' && Math.random() < 0.55) {
        this.lootSpots.push({ x: o.x - 26, y: o.y + o.h / 2, district: null });
      }
    }
    // random open field loot
    for (let i = 0; i < 90; i++) {
      const x = rand(200, S - 200);
      const y = rand(200, S - 200);
      if (this._blocked(x, y, 30)) continue;
      this.lootSpots.push({ x, y, district: null });
    }
  }

  _overlap(a, b, pad) {
    return !(a.x + a.w + pad < b.x || b.x + b.w + pad < a.x || a.y + a.h + pad < b.y || b.y + b.h + pad < a.y);
  }

  _nearRoad(x, y, pad) {
    return this.roads.some((r) => x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + r.h + pad);
  }

  _blocked(x, y, r) {
    const near = this.grid.query(x, y, r + 40, this._q);
    for (const item of near) {
      const o = item.ref;
      if (o.shape === 'rect') {
        if (x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r) return true;
      } else if (dist(x, y, o.x, o.y) < o.r + r) return true;
    }
    return false;
  }

  _insideAnyBuilding(x, y, pad) {
    return this.floors.some((f) => x > f.x - pad && x < f.x + f.w + pad && y > f.y - pad && y < f.y + f.h + pad);
  }

  _makeBuilding(b) {
    const T = 18;
    const district = this._districtAt(b.x, b.y).name;
    this.floors.push({ x: b.x, y: b.y, w: b.w, h: b.h, district });

    const doorW = 86;
    const sides = ['top', 'bottom', 'left', 'right'];
    const doors = [];
    // 1-2 doors
    doors.push(pick(sides));
    if (Math.random() < 0.6) {
      const d2 = pick(sides);
      if (d2 !== doors[0]) doors.push(d2);
    }

    const makeWall = (x, y, w, h, side) => {
      if (!doors.includes(side)) {
        this.addRect(x, y, w, h, 'wall');
        return;
      }
      // split with gap in the middle
      if (w > h) {
        const gap = Math.min(doorW, w - 60);
        const leftW = (w - gap) / 2;
        this.addRect(x, y, leftW, h, 'wall');
        this.addRect(x + leftW + gap, y, w - leftW - gap, h, 'wall');
      } else {
        const gap = Math.min(doorW, h - 60);
        const topH = (h - gap) / 2;
        this.addRect(x, y, w, topH, 'wall');
        this.addRect(x, y + topH + gap, w, h - topH - gap, 'wall');
      }
    };

    makeWall(b.x, b.y, b.w, T, 'top');
    makeWall(b.x, b.y + b.h - T, b.w, T, 'bottom');
    makeWall(b.x, b.y + T, T, b.h - T * 2, 'left');
    makeWall(b.x + b.w - T, b.y + T, T, b.h - T * 2, 'right');

    // interior wall sometimes
    if (b.w > 320 && Math.random() < 0.65) {
      const wx = b.x + b.w * rand(0.4, 0.6);
      const gapY = b.y + b.h * rand(0.35, 0.65);
      this.addRect(wx, b.y + T, T, Math.max(40, gapY - b.y - T - 55), 'wall');
      this.addRect(wx, gapY + 55, T, Math.max(40, b.y + b.h - T - (gapY + 55)), 'wall');
    }
  }

  _districtAt(x, y) {
    let best = this.districts[0];
    let bd = Infinity;
    for (const d of this.districts) {
      const dd = (x - d.cx) ** 2 + (y - d.cy) ** 2;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** resolve collisions for a circle entity, mutating x/y */
  resolveCircle(ent, radius) {
    const near = this.grid.query(ent.x, ent.y, radius + 90, this._q);
    for (let iter = 0; iter < 2; iter++) {
      for (const item of near) {
        const o = item.ref;
        if (!o.solid) continue;
        if (o.shape === 'rect') {
          const push = circleRectResolve(ent.x, ent.y, radius, o.x, o.y, o.w, o.h);
          if (push) {
            ent.x += push.x;
            ent.y += push.y;
          }
        } else {
          const d = dist(ent.x, ent.y, o.x, o.y);
          const min = radius + o.r;
          if (d < min && d > 0.001) {
            ent.x += ((ent.x - o.x) / d) * (min - d);
            ent.y += ((ent.y - o.y) / d) * (min - d);
          } else if (d <= 0.001) {
            ent.x += min;
          }
        }
      }
    }
    ent.x = clamp(ent.x, radius, this.size - radius);
    ent.y = clamp(ent.y, radius, this.size - radius);
  }

  /** first hit along a segment; returns {dist,point,obstacle} or null */
  raycast(x1, y1, x2, y2, maxDist = Infinity) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.min(120, Math.ceil(len / 26));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      if (px < 0 || py < 0 || px > this.size || py > this.size) return { t, x: px, y: py, obstacle: null, edge: true };
      const near = this.grid.query(px, py, 4, this._q);
      for (const item of near) {
        const o = item.ref;
        if (!o.blocksBullets) continue;
        if (o.shape === 'rect') {
          if (px > o.x && px < o.x + o.w && py > o.y && py < o.y + o.h) {
            return { t, x: px, y: py, obstacle: o };
          }
        } else if (dist(px, py, o.x, o.y) < o.r) {
          return { t, x: px, y: py, obstacle: o };
        }
      }
    }
    return null;
  }

  pointBlocked(x, y) {
    if (x < 2 || y < 2 || x > this.size - 2 || y > this.size - 2) return true;
    const near = this.grid.query(x, y, 3, this._q);
    for (const item of near) {
      const o = item.ref;
      if (!o.blocksBullets) continue;
      if (o.shape === 'rect') {
        if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
      } else if (dist(x, y, o.x, o.y) < o.r) return true;
    }
    return false;
  }

  hasLineOfSight(x1, y1, x2, y2) {
    return this.raycast(x1, y1, x2, y2) === null;
  }

  randomOpenPoint(pad = 60) {
    for (let i = 0; i < 200; i++) {
      const x = rand(pad, this.size - pad);
      const y = rand(pad, this.size - pad);
      if (!this._blocked(x, y, 30)) return { x, y };
    }
    return { x: this.size / 2, y: this.size / 2 };
  }
}
