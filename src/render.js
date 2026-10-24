import { clamp, lerp, rand, TAU, dist } from './utils.js';
import { WEAPONS } from './config.js';

const iso = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

function makeGroundPattern() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 512);
  grd.addColorStop(0, '#3a5a33');
  grd.addColorStop(1, '#405f36');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const s = Math.random() * 2.4 + 0.4;
    const l = Math.random();
    g.fillStyle = l < 0.5
      ? `rgba(118,168,88,${0.22 + Math.random() * 0.32})`
      : `rgba(34,58,32,${0.18 + Math.random() * 0.3})`;
    g.fillRect(x, y, s, s * (1 + Math.random() * 2));
  }
  // dry patches
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(120,110,60,${0.05 + Math.random() * 0.06})`;
    g.beginPath();
    g.arc(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 0, TAU);
    g.fill();
  }
  return c;
}

function makeAsphaltPattern() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3f45';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(255,255,255,${Math.random() * 0.05})` : `rgba(0,0,0,${Math.random() * 0.14})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = 0;
    this.h = 0;
    this.ground = makeGroundPattern();
    this.asphalt = makeAsphaltPattern();
    this.groundPat = this.ctx.createPattern(this.ground, 'repeat');
    this.asphaltPat = this.ctx.createPattern(this.asphalt, 'repeat');
    this.shakeAmount = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.groundPat = this.ctx.createPattern(this.ground, 'repeat');
    this.asphaltPat = this.ctx.createPattern(this.asphalt, 'repeat');
  }

  addShake(a) {
    this.shakeAmount = Math.min(22, this.shakeAmount + a);
  }

  updateShake(dt) {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 42);
    const s = this.shakeAmount;
    this.shakeX = rand(-s, s);
    this.shakeY = rand(-s, s);
  }

  begin(camera) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x + this.shakeX / camera.zoom, -camera.y + this.shakeY / camera.zoom);
    this.view = {
      x: camera.x - this.w / 2 / camera.zoom,
      y: camera.y - this.h / 2 / camera.zoom,
      w: this.w / camera.zoom,
      h: this.h / camera.zoom,
    };
  }

  end() {
    this.ctx.restore();
  }

  inView(x, y, pad = 100) {
    const v = this.view;
    return x > v.x - pad && x < v.x + v.w + pad && y > v.y - pad && y < v.y + v.h + pad;
  }

  drawGround(world) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.fillStyle = '#37522f';
    ctx.fillRect(v.x, v.y, v.w, v.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    ctx.fillStyle = this.groundPat;
    ctx.fillRect(v.x, v.y, v.w, v.h);

    // world border
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, world.size, world.size);
    ctx.restore();

    // roads
    for (const r of world.roads) {
      if (r.x > v.x + v.w || r.x + r.w < v.x || r.y > v.y + v.h || r.y + r.h < v.y) continue;
      ctx.fillStyle = '#33363b';
      ctx.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
      ctx.fillStyle = this.asphaltPat;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(230,220,160,0.18)';
      ctx.lineWidth = 3;
      ctx.setLineDash([34, 30]);
      ctx.beginPath();
      if (r.w > r.h) {
        ctx.moveTo(r.x, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w, r.y + r.h / 2);
      } else {
        ctx.moveTo(r.x + r.w / 2, r.y);
        ctx.lineTo(r.x + r.w / 2, r.y + r.h);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // building floors
    for (const f of world.floors) {
      if (f.x > v.x + v.w || f.x + f.w < v.x || f.y > v.y + v.h || f.y + f.h < v.y) continue;
      ctx.fillStyle = '#6f6a5d';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      const t = 64;
      for (let x = f.x + t; x < f.x + f.w; x += t) ctx.fillRect(x, f.y, 2, f.h);
      for (let y = f.y + t; y < f.y + f.h; y += t) ctx.fillRect(f.x, y, f.w, 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    }
  }

  drawBushes(world) {
    const ctx = this.ctx;
    for (const b of world.bushes || []) {
      if (!this.inView(b.x, b.y, 90)) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(6, 8, b.r * 1.02, b.r * 0.62, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(-b.r * 0.3, -b.r * 0.3, b.r * 0.2, 0, 0, b.r);
      g.addColorStop(0, '#3f7a3a');
      g.addColorStop(0.7, '#2c5c2a');
      g.addColorStop(1, '#204420');
      ctx.fillStyle = g;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + b.seed;
        const rr = b.r * (0.42 + 0.18 * Math.sin(b.seed + i));
        ctx.beginPath();
        ctx.arc(Math.cos(a) * b.r * 0.4, Math.sin(a) * b.r * 0.4, rr, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawTreeTrunks(world) {
    const ctx = this.ctx;
    for (const t of world.trees || []) {
      if (!this.inView(t.x, t.y, 100)) continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(10, 14, t.r * 0.85, t.r * 0.45, 0, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(-6, -6, 3, 0, 0, 26);
      g.addColorStop(0, '#6b4c31');
      g.addColorStop(1, '#3a2717');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawTreeCanopies(world, alpha = 0.9, player = null) {
    const ctx = this.ctx;
    ctx.save();
    for (const t of world.trees || []) {
      if (!this.inView(t.x, t.y, 120)) continue;
      let a = alpha;
      if (player && player.alive) {
        const d = Math.hypot(player.x - t.x, player.y - t.y);
        if (d < t.r + 34) a = 0.18 + 0.5 * Math.max(0, (d - t.r * 0.3) / (t.r + 34));
      }
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.sin(t.seed) * 0.3);
      const r = t.r;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.18, 0, 0, r);
      g.addColorStop(0, t.tint > 0 ? '#4e8f45' : '#467f3e');
      g.addColorStop(0.55, '#2f6431');
      g.addColorStop(1, '#1d3f22');
      ctx.fillStyle = g;
      for (let i = 0; i < 5; i++) {
        const a = t.seed + (i / 5) * TAU;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34, r * 0.56, 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, TAU);
      ctx.fill();
      // highlight blobs
      ctx.fillStyle = 'rgba(160,220,125,0.16)';
      ctx.beginPath();
      ctx.arc(-r * 0.26, -r * 0.32, r * 0.36, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 0.12, -r * 0.5, r * 0.2, 0, TAU);
      ctx.fill();
      // leaf speckles
      ctx.fillStyle = 'rgba(20,45,22,0.35)';
      for (let i = 0; i < 4; i++) {
        const a2 = t.seed * 1.7 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a2) * r * 0.55, Math.sin(a2) * r * 0.55, r * 0.12, 0, TAU);
        ctx.fill();
      }
      // rim
      ctx.strokeStyle = 'rgba(18,38,20,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  drawObstacles(world, kinds = ['crate', 'wall', 'rock']) {
    const ctx = this.ctx;
    for (const kind of kinds) {
      for (const o of world.obstacles) {
        if (o.kind !== kind) continue;
        if (o.shape === 'rect') {
          if (o.x > this.view.x + this.view.w || o.x + o.w < this.view.x || o.y > this.view.y + this.view.h || o.y + o.h < this.view.y) continue;
        } else if (!this.inView(o.x, o.y, o.r + 60)) continue;

        if (o.kind === 'wall') {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(o.x + 7, o.y + 9, o.w, o.h);
          const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
          g.addColorStop(0, '#9a9284');
          g.addColorStop(0.45, '#7d766a');
          g.addColorStop(1, '#5d574d');
          ctx.fillStyle = g;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = 'rgba(30,28,24,0.75)';
          ctx.lineWidth = 3;
          ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(o.x + 3, o.y + 3, o.w - 6, 3);
        } else if (o.kind === 'crate') {
          ctx.fillStyle = 'rgba(0,0,0,0.33)';
          ctx.fillRect(o.x + 6, o.y + 8, o.w, o.h);
          const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y + o.h);
          g.addColorStop(0, '#a8763f');
          g.addColorStop(1, '#6e4a25');
          ctx.fillStyle = g;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = '#4c3116';
          ctx.lineWidth = 3;
          ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
          ctx.beginPath();
          ctx.moveTo(o.x + 3, o.y + 3);
          ctx.lineTo(o.x + o.w - 3, o.y + o.h - 3);
          ctx.moveTo(o.x + o.w - 3, o.y + 3);
          ctx.lineTo(o.x + 3, o.y + o.h - 3);
          ctx.strokeStyle = 'rgba(60,38,15,0.55)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,220,160,0.12)';
          ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 4);
        } else if (o.kind === 'rock') {
          ctx.fillStyle = 'rgba(0,0,0,0.33)';
          ctx.beginPath();
          ctx.ellipse(o.x + 7, o.y + 9, o.r, o.r * 0.85, 0, 0, TAU);
          ctx.fill();
          const g = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.15, o.x, o.y, o.r);
          g.addColorStop(0, '#a9a69b');
          g.addColorStop(0.55, '#6d6b63');
          g.addColorStop(1, '#3a3934');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(35,34,31,0.6)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath();
          ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.3, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  drawZone(zone, world, now) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.arc(zone.x, zone.y, zone.radius, 0, TAU, true);
    ctx.fillStyle = 'rgba(150,20,60,0.34)';
    ctx.fill('evenodd');

    // boundary
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, 0, TAU);
    ctx.strokeStyle = 'rgba(120,200,255,0.55)';
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = zone.shrinking ? 'rgba(255,120,90,0.95)' : 'rgba(180,235,255,0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();

    // glowing dashes
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius, now * 0.35, now * 0.35 + TAU * 0.7);
    ctx.strokeStyle = zone.shrinking ? 'rgba(255,180,140,0.8)' : 'rgba(150,230,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // next circle
    if (zone.state === 'wait' && !zone.finished) {
      ctx.beginPath();
      ctx.arc(zone.targetX, zone.targetY, Math.max(2, zone.targetRadius), 0, TAU);
      ctx.setLineDash([16, 16]);
      ctx.lineDashOffset = -now * 30;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawPickups(pickups, now) {
    const ctx = this.ctx;
    for (const p of pickups) {
      if (!p.alive || !this.inView(p.x, p.y, 60)) continue;
      const bob = Math.sin(now * 3 + p.seed) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      // glow
      const glowColor = p.type === 'weapon' ? 'rgba(255,215,110,' : p.type === 'medkit' ? 'rgba(110,255,160,' : p.type === 'shield' ? 'rgba(120,190,255,' : 'rgba(255,255,255,';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      g.addColorStop(0, glowColor + '0.36)');
      g.addColorStop(1, glowColor + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 14, 13, 5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(p.x, p.y + bob - 6);
      if (p.type === 'weapon') {
        const w = WEAPONS[p.key];
        ctx.rotate(-0.5);
        ctx.fillStyle = 'rgba(20,24,28,0.9)';
        iso(ctx, -15, -4, 30, 8, 3);
        ctx.fill();
        ctx.fillStyle = w.color;
        iso(ctx, -12, -2.5, 20, 5, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(20,24,28,0.9)';
        iso(ctx, -6, 2, 6, 10, 2);
        ctx.fill();
        ctx.rotate(0.5);
        ctx.fillStyle = '#ffe28a';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(w.label, 0, -16);
      } else if (p.type === 'medkit') {
        ctx.fillStyle = '#f5f7f5';
        iso(ctx, -11, -9, 22, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#e0443f';
        ctx.fillRect(-2.5, -5, 5, 10);
        ctx.fillRect(-6, -1.5, 12, 5);
      } else if (p.type === 'shield') {
        ctx.fillStyle = 'rgba(120,190,255,0.28)';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#8ecbff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(9, -6);
        ctx.lineTo(9, 3);
        ctx.quadraticCurveTo(9, 10, 0, 13);
        ctx.quadraticCurveTo(-9, 10, -9, 3);
        ctx.lineTo(-9, -6);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(150,215,255,0.35)';
        ctx.fill();
      } else if (p.type === 'ammo') {
        ctx.fillStyle = '#2f3a30';
        iso(ctx, -11, -9, 22, 18, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,200,150,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#d8cf8f';
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(i * 6 - 2, -5, 4, 9);
          ctx.fillStyle = '#b8863f';
          ctx.fillRect(i * 6 - 2, -5, 4, 2.5);
          ctx.fillStyle = '#d8cf8f';
        }
        ctx.fillStyle = '#ffe28a';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AMMO', 0, -16);
      } else if (p.type === 'shield') {
        ctx.fillStyle = '#9fd8ff';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SHIELD', 0, -18);
      }
      ctx.restore();
    }
  }

  drawBullets(bullets) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of bullets) {
      if (!this.inView(b.x, b.y, 40)) continue;
      const len = b.weaponKey === 'sniper' ? 46 : b.weaponKey === 'shotgun' ? 16 : 26;
      const tx = b.x - Math.cos(b.angle) * len;
      const ty = b.y - Math.sin(b.angle) * len;
      const g = ctx.createLinearGradient(tx, ty, b.x, b.y);
      const c = b.weaponKey === 'sniper' ? '199,125,255' : b.weaponKey === 'shotgun' ? '255,150,90' : '255,225,140';
      g.addColorStop(0, `rgba(${c},0)`);
      g.addColorStop(1, `rgba(${c},0.95)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = b.weaponKey === 'sniper' ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,235,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      if (!this.inView(p.x, p.y, 40)) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a * (p.alpha ?? 1);
      ctx.fillStyle = p.color;
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, TAU);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.grow ? 1.6 - a : 1), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFighter(f, now, isPlayer) {
    const ctx = this.ctx;
    if (!f.alive) return;
    if (!this.inView(f.x, f.y, 120)) return;
    const r = f.r;
    const aim = f.angle;
    const walk = Math.sin(f.walkPhase) * (f.moving ? 1 : 0);
    const skin = f.skin;

    ctx.save();
    ctx.translate(f.x, f.y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(3, 7, r * 1.05, r * 0.72, 0, 0, TAU);
    ctx.fill();

    // selection ring for player
    if (isPlayer) {
      const pulse = 0.55 + Math.sin(now * 3.2) * 0.22;
      const gl = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r + 26);
      gl.addColorStop(0, 'rgba(120,220,255,0.20)');
      gl.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, r + 26, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(150,235,255,${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, 0, TAU);
      ctx.stroke();
      // direction notch
      ctx.save();
      ctx.rotate(aim);
      ctx.fillStyle = 'rgba(170,240,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(r + 17, 0);
      ctx.lineTo(r + 8, -5);
      ctx.lineTo(r + 8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // legs
    ctx.save();
    ctx.rotate(f.moveAngle);
    ctx.fillStyle = '#20262e';
    iso(ctx, -7, -r * 0.55 + walk * 5, 15, r * 0.42, 5);
    ctx.fill();
    iso(ctx, -7, r * 0.12 - walk * 5, 15, r * 0.42, 5);
    ctx.fill();
    ctx.restore();

    // body
    const bg = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r * 1.15);
    bg.addColorStop(0, lighten(skin.body, 34));
    bg.addColorStop(0.6, skin.body);
    bg.addColorStop(1, darken(skin.body, 34));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,18,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // vest
    ctx.save();
    ctx.rotate(aim);
    ctx.fillStyle = 'rgba(20,26,32,0.42)';
    iso(ctx, -r * 0.45, -r * 0.5, r * 0.6, r, 6);
    ctx.fill();
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, -r * 0.3);
    ctx.lineTo(-r * 0.1, -r * 0.3);
    ctx.moveTo(-r * 0.42, r * 0.05);
    ctx.lineTo(-r * 0.1, r * 0.05);
    ctx.stroke();
    ctx.restore();

    // arms + gun
    ctx.save();
    ctx.rotate(aim);
    ctx.fillStyle = lighten(skin.body, 18);
    iso(ctx, r * 0.15, -r * 0.85, r * 0.7, r * 0.34, 5);
    ctx.fill();
    iso(ctx, r * 0.15, r * 0.5, r * 0.7, r * 0.34, 5);
    ctx.fill();

    const w = f.weapon;
    const gunLen = w.melee ? 12 : w.name === 'AWM' ? 44 : w.name === 'M1014' ? 32 : w.name === 'M500' ? 20 : 34;
    const gunThick = w.melee ? 5 : 7;
    const recoilOffset = f.recoil * 0.8;
    ctx.translate(r * 0.85 - recoilOffset, 0);
    ctx.fillStyle = '#181d23';
    iso(ctx, -6, -gunThick / 2, gunLen, gunThick, 2.5);
    ctx.fill();
    ctx.fillStyle = w.color;
    iso(ctx, 2, -2.2, gunLen * 0.55, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = '#22282f';
    iso(ctx, -2, 2, 8, 8, 2);
    ctx.fill();
    if (w.name === 'AWM') {
      ctx.fillStyle = '#3a2f4a';
      iso(ctx, 6, -9, 12, 4, 2);
      ctx.fill();
    }
    ctx.restore();

    // healing / reload indicators
    if (f.healing) {
      const p = 1 - clamp((f.healEnd - now) / 2.6, 0, 1);
      ctx.strokeStyle = 'rgba(110,255,160,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    } else if (f.reloading) {
      const w2 = f.weapon;
      const p = 1 - clamp((f.reloadEnd - now) / (w2.reload || 1), 0, 1);
      ctx.strokeStyle = 'rgba(255,215,110,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
    }

    // hit flash
    if (f.hitFlash > 0) {
      ctx.globalAlpha = f.hitFlash * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // shield glow
    if (f.shield > 0) {
      ctx.strokeStyle = `rgba(120,190,255,${0.22 + (f.shield / 100) * 0.35})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    // health bar above
    if (!isPlayer && (f.hp < f.maxHp || f.shield > 0)) {
      const bw = 40;
      const bx = f.x - bw / 2;
      const by = f.y - r - 18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
      ctx.fillStyle = '#4de07a';
      ctx.fillRect(bx, by, bw * clamp(f.hp / f.maxHp, 0, 1), 4);
      if (f.shield > 0) {
        ctx.fillStyle = '#78bfff';
        ctx.fillRect(bx, by + 4, bw * clamp(f.shield / f.maxShield, 0, 1), 3);
      }
    }
  }

  drawDamageNumbers(nums) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    for (const n of nums) {
      const a = clamp(n.life / n.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `bold ${n.crit ? 24 : 18}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.crit ? '#ffd23a' : '#ffffff';
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.restore();
  }

  drawMuzzleFlash(list) {
    const ctx = this.ctx;
    for (const f of list) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      g.addColorStop(0, 'rgba(255,255,220,0.95)');
      g.addColorStop(0.35, 'rgba(255,200,90,0.65)');
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(6, 0, 26, 13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,220,0.95)';
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(16, -4);
      ctx.lineTo(26, 0);
      ctx.lineTo(16, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** screen-space vignette + low health pulse */
  drawPost(player, now) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.32, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.44)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);

    if (player && player.alive && player.hp < 40) {
      const a = (1 - player.hp / 40) * (0.24 + Math.sin(now * 6) * 0.07);
      const rg = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.2, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.62);
      rg.addColorStop(0, 'rgba(190,20,40,0)');
      rg.addColorStop(1, `rgba(190,20,40,${a})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    ctx.restore();
  }
}

function hexToRgb(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lighten(h, amt) {
  const { r, g, b } = hexToRgb(h);
  return `rgb(${clamp(r + amt, 0, 255)},${clamp(g + amt, 0, 255)},${clamp(b + amt, 0, 255)})`;
}
function darken(h, amt) {
  const { r, g, b } = hexToRgb(h);
  return `rgb(${clamp(r - amt, 0, 255)},${clamp(g - amt, 0, 255)},${clamp(b - amt, 0, 255)})`;
}
