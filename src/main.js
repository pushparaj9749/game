import { WORLD_SIZE, BOT_COUNT, WEAPONS, WEAPON_DROPS, NAMES, SKINS } from './config.js';
import { World } from './world.js';
import { Zone } from './zone.js';
import { Player, Bot, Bullet, AMMO_MAX } from './entities.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { audio } from './audio.js';
import {
  clamp, rand, randInt, pick, dist, dist2, lerp, segCircleHit, angleDiff, TAU,
} from './utils.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new Renderer(this.canvas);
    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.state = 'menu';
    this.cam = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1 };
    this.time = 0;
    this.last = performance.now();
    this.paused = false;

    this.bullets = [];
    this.particles = [];
    this.numbers = [];
    this.flashes = [];
    this.pickups = [];
    this.bots = [];

    this.input.onKey = (code) => this.onKey(code);

    document.getElementById('playBtn').addEventListener('click', () => this.start());
    document.getElementById('againBtn').addEventListener('click', () => {
      document.getElementById('endScreen').classList.add('hidden');
      this.start();
    });
    document.getElementById('nameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.start();
      e.stopPropagation();
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  onKey(code) {
    if (this.state !== 'playing') {
      if (code === 'Enter' && this.state === 'menu') this.start();
      return;
    }
    const p = this.player;
    if (!p || !p.alive) return;
    if (code === 'KeyR') p.startReload(this.time);
    if (code === 'KeyF') {
      if (p.medkits > 0 && p.hp < p.maxHp) p.startHeal(this.time);
      else this.hud.toast(p.medkits <= 0 ? 'NO MEDKITS' : 'HEALTH IS FULL', 1000);
    }
    if (code === 'KeyE') this.swapNearbyLoot();
    if (code === 'Digit1') p.switchSlot(0);
    if (code === 'Digit2') p.switchSlot(1);
    if (code === 'KeyM') {
      audio.setMuted(!audio.muted);
      this.hud.toast(audio.muted ? 'MUTED' : 'SOUND ON', 900);
    }
  }

  start() {
    audio.init();
    audio.resume();
    const name = (document.getElementById('nameInput').value || 'PLAYER').toUpperCase().slice(0, 14);
    this.playerName = name;
    this.hud.playerName.textContent = name;

    this.world = new World();
    this.zone = new Zone(this.world);
    this.zone.idleOffset = 6;
    this.time = 0;
    this.gameStarted = performance.now() / 1000;
    this.elapsed = 0;
    this.bullets = [];
    this.particles = [];
    this.numbers = [];
    this.flashes = [];
    this.pickups = [];
    this.bots = [];
    this.state = 'playing';
    this.rank = 0;
    this.nearLoot = null;
    this.endShown = false;
    this.warningUntil = 0;
    this.zoneTick = 0;
    this.warningShown = false;
    this.hudShownAt = 0;

    // ---- player spawn ----
    const spawn = this.findSpawn();
    this.player = new Player(this, spawn.x, spawn.y, name);
    this.player.vx = 0;
    this.player.vy = 0;

    // ---- bots ----
    const names = [...NAMES].sort(() => Math.random() - 0.5);
    const skins = [...SKINS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < BOT_COUNT; i++) {
      const s = this.findSpawn(260);
      const b = new Bot(this, s.x, s.y, names[i % names.length] + (i >= names.length ? '_' + (i + 1) : ''), skins[i % skins.length]);
      b.vx = 0;
      b.vy = 0;
      this.bots.push(b);
    }

    // ---- loot ----
    this.spawnLoot();

    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.updateZoom();

    // ---- UI ----
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('endScreen').classList.add('hidden');
    document.getElementById('endScreen').querySelector('.end-inner').classList.remove('lose');
    this.hud.show();
    this.hud._cache = {};
    this.hud.hint.classList.remove('hidden');
    this.hud.hideZoneWarning?.();
    this.hud.showZoneWarning(false);
    this.hud.setAlive(BOT_COUNT + 1);
    this.hud.setKills(0);
    this.hud.toast('DROP ZONE: ' + this.world._districtAt(this.player.x, this.player.y).name.toUpperCase(), 2000);
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.hud.hideHint(), 9000);
    this.input.mouseDown = false;
    this.input.keys.clear();
  }

  findSpawn(minFromPlayer = 0) {
    for (let i = 0; i < 300; i++) {
      const a = rand(0, TAU);
      const rr = Math.sqrt(Math.random()) * (this.zone.radius * 0.86);
      const x = clamp(this.zone.x + Math.cos(a) * rr, 80, this.world.size - 80);
      const y = clamp(this.zone.y + Math.sin(a) * rr, 80, this.world.size - 80);
      if (this.world._blocked(x, y, 42)) continue;
      if (minFromPlayer > 0 && this.player && dist(x, y, this.player.x, this.player.y) < minFromPlayer) continue;
      return { x, y };
    }
    return this.world.randomOpenPoint(120);
  }

  spawnLoot() {
    const spots = [...this.world.lootSpots];
    for (const s of spots) {
      const r = Math.random();
      if (r < 0.5) {
        this.addPickup('weapon', s.x, s.y, { key: pick(WEAPON_DROPS) });
      } else if (r < 0.74) {
        const ammoKey = pick(['light', 'light', 'medium', 'medium', 'heavy']);
        this.addPickup('ammo', s.x, s.y, { key: ammoKey });
      } else if (r < 0.9) {
        this.addPickup('medkit', s.x, s.y, {});
      } else {
        this.addPickup('shield', s.x, s.y, {});
      }
    }
  }

  addPickup(type, x, y, opts = {}) {
    this.pickups.push({
      type, x, y, key: opts.key || null, alive: true,
      seed: Math.random() * 100, born: this.time, amount: opts.amount || 0,
    });
  }

  spawnBullet(o) {
    this.bullets.push(new Bullet(o));
  }

  spawnMuzzleFlash(x, y, angle, w) {
    this.flashes.push({ x, y, angle, life: 0.07, maxLife: 0.07, big: (w.recoil || 1) > 3 });
    if (w.name === 'AWM' || w.name === 'M1014') {
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          x, y, vx: Math.cos(angle + rand(-0.5, 0.5)) * rand(20, 70),
          vy: Math.sin(angle + rand(-0.5, 0.5)) * rand(20, 70),
          size: rand(4, 9), life: 0.5, maxLife: 0.5, color: 'rgba(210,210,200,0.5)',
          kind: 'smoke', grow: true,
        });
      }
    }
  }

  spawnDust(x, y) {
    this.particles.push({
      x: x + rand(-5, 5), y: y + rand(-2, 6), vx: rand(-10, 10), vy: rand(-16, -4),
      size: rand(2.5, 5), life: 0.4, maxLife: 0.4, color: 'rgba(190,180,150,0.28)', kind: 'dust', grow: true,
    });
  }

  bloodBurst(x, y, angle, count = 8) {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-0.9, 0.9);
      const sp = rand(50, 240);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: rand(1.6, 4), life: rand(0.25, 0.6), maxLife: 0.6,
        color: Math.random() < 0.6 ? 'rgba(210,40,45,0.9)' : 'rgba(140,20,25,0.85)', kind: 'blood',
      });
    }
  }

  sparkBurst(x, y, angle) {
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI + rand(-1, 1);
      const sp = rand(40, 150);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: rand(1, 2.4), life: rand(0.15, 0.35), maxLife: 0.35,
        color: 'rgba(255,220,140,0.9)', kind: 'spark',
      });
    }
    this.particles.push({
      x, y, vx: 0, vy: 0, size: 10, life: 0.22, maxLife: 0.22,
      color: 'rgba(200,200,190,0.35)', kind: 'ring',
    });
  }

  shake(a) { this.renderer.addShake(a); }

  meleeSwing(attacker) {
    let hitAny = false;
    const targets = [this.player, ...this.bots];
    for (const t of targets) {
      if (t === attacker || !t.alive) continue;
      const d = dist(attacker.x, attacker.y, t.x, t.y);
      if (d > 62 + t.r) continue;
      const a = Math.atan2(t.y - attacker.y, t.x - attacker.x);
      if (Math.abs(angleDiff(attacker.angle, a)) > 0.9) continue;
      this.damageFighter(t, attacker.weapon.damage, attacker, attacker.angle);
      hitAny = true;
    }
    if (attacker.isPlayer) {
      this.shake(3);
      audio.shoot('fists', 0.5);
    }
    return hitAny;
  }

  damageFighter(target, amount, from, angle) {
    if (!target.alive) return;
    // small mercy factor when bots hit the human player — keeps firefights winnable
    if (target.isPlayer && from && !from.isPlayer) amount *= 0.7;
    target.takeDamage(amount, from);
    this.bloodBurst(
      target.x + rand(-6, 6), target.y + rand(-6, 6),
      angle ?? rand(0, TAU), Math.round(clamp(amount / 3, 3, 12)),
    );
    this.numbers.push({
      x: target.x + rand(-10, 10), y: target.y - target.r - 8,
      text: Math.round(amount), life: 0.85, maxLife: 0.85,
      vy: -46, crit: amount >= 40,
    });
    if (target.isPlayer) {
      this.shake(clamp(amount * 0.5, 4, 16));
      audio.hurt();
    } else if (from && from.isPlayer) {
      audio.hit();
      if (amount >= 40) audio.headshot();
    }
  }

  onDeath(victim, killer) {
    // placement bookkeeping
    victim.place = this.aliveCount() + 1;

    if (killer && killer !== victim && killer.alive) {
      killer.kills++;
      if (killer.isPlayer) {
        this.hud.setKills(killer.kills);
        audio.kill();
        this.hud.toast('ELIMINATED ' + victim.name, 1100);
      }
    }
    this.hud.feed(killer && killer !== victim ? killer.name : victim.name, victim.name, !!(killer && killer.isPlayer), victim.isPlayer);

    // drop loot
    if (victim.slots[0]) this.addPickup('weapon', victim.x + rand(-24, 24), victim.y + rand(-24, 24), { key: victim.slots[0] });
    if (victim.slots[1] && Math.random() < 0.8) this.addPickup('weapon', victim.x + rand(-30, 30), victim.y + rand(-30, 30), { key: victim.slots[1] });
    if (victim.medkits > 0 && Math.random() < 0.7) this.addPickup('medkit', victim.x + rand(-20, 20), victim.y + rand(-20, 20), {});
    if (victim.shield > 20) this.addPickup('shield', victim.x + rand(-20, 20), victim.y + rand(-20, 20), {});

    // death fx
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      this.particles.push({
        x: victim.x, y: victim.y, vx: Math.cos(a) * rand(30, 170), vy: Math.sin(a) * rand(30, 170),
        size: rand(2, 5), life: rand(0.4, 0.9), maxLife: 0.9,
        color: 'rgba(190,30,35,0.85)', kind: 'blood',
      });
    }

    if (!victim.isPlayer && killer && killer.isPlayer) {
      this.shake(9);
    }
    if (victim.isPlayer) {
      this.shake(22);
      audio.death();
      this.endGame(false, victim.place);
    } else {
      const alive = this.aliveCount();
      this.hud.setAlive(alive);
      if (alive === 1 && this.player.alive) {
        this.endGame(true, 1);
      }
    }
  }

  aliveCount() {
    let n = 0;
    for (const b of this.bots) if (b.alive) n++;
    if (this.player && this.player.alive) n++;
    return n;
  }

  endGame(won, place) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.endTimer = 1.1;
    this.won = won;
    this.finalPlace = place;
    this.hud.showZoneWarning(false);
    if (won) audio.booyah();
  }

  showEndScreen() {
    const p = this.player;
    const inner = document.getElementById('endScreen').querySelector('.end-inner');
    inner.classList.toggle('lose', !this.won);
    document.getElementById('endRank').textContent = this.won ? 'VICTORY ROYALE' : `#${this.finalPlace} OF ${BOT_COUNT + 1}`;
    document.getElementById('endTitle').textContent = this.won ? 'BOOYAH!' : 'ELIMINATED';
    document.getElementById('endSub').textContent = this.won
      ? 'You are the last one standing. Absolute legend.'
      : `You were taken out. ${this.player.kills} kills — try again, soldier.`;
    document.getElementById('endKills').textContent = p.kills;
    document.getElementById('endDamage').textContent = Math.round(p.damageDealt);
    document.getElementById('endTime').textContent = fmt(this.elapsed);
    document.getElementById('endPlace').textContent = `${this.won ? 1 : this.finalPlace}/${BOT_COUNT + 1}`;
    document.getElementById('endScreen').classList.remove('hidden');
    this.hud.hide();
  }

  updateZoom() {
    const r = this.renderer;
    this.cam.zoom = clamp(Math.min(r.w / 1460, r.h / 900), 0.72, 1.12);
  }

  // ---------------- main loop ----------------
  loop(t) {
    const rawDt = (t - this.last) / 1000;
    this.last = t;
    const dt = Math.min(0.05, rawDt);
    if (this.state === 'playing' || this.state === 'over') this.update(dt);
    this.render(dt);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  update(dt) {
    this.time += dt;
    this.elapsed += dt;
    const now = this.time;
    const p = this.player;

    this.updateZoom();

    // --- player input ---
    if (p.alive) {
      this.input.computeAim(this.cam, p, { w: this.renderer.w, h: this.renderer.h });
      p.update(dt, now, {
        keys: this.input.keys,
        mouseDown: this.state === 'playing' && this.input.mouseDown,
        aimAngle: this.input.aimAngle,
      });
      p.updateTimers(now, dt);
      const w = p.weapon;
      if (this.input.mouseDown && !w.melee && p.mag === 0 && !(p.reserve[w.ammo] > 0) && !p.reloading) {
        if (now - (this._dryFireAt || -9) > 1.4) {
          this._dryFireAt = now;
          audio.reload();
          this.hud.toast('OUT OF ' + w.ammo.toUpperCase() + ' AMMO', 900);
        }
      }
    }

    // --- bots ---
    for (const b of this.bots) {
      if (!b.alive) continue;
      b.update(dt, now);
      if (Math.random() < dt * 0.6) b.pickBestSlot();
      if (!b.target && b.hp < 55 && b.medkits > 0 && !b.healing && Math.random() < dt * 1.5) {
        b.startHeal(now);
      }
      // approximate velocity for lead prediction
      b.vx = (b.x - (b.px ?? b.x)) / Math.max(dt, 0.0001);
      b.vy = (b.y - (b.py ?? b.y)) / Math.max(dt, 0.0001);
      b.px = b.x;
      b.py = b.y;
    }
    if (p.alive) {
      p.vx = (p.x - (p.px ?? p.x)) / Math.max(dt, 0.0001);
      p.vy = (p.y - (p.py ?? p.y)) / Math.max(dt, 0.0001);
      p.px = p.x;
      p.py = p.y;
    }

    this.updateBullets(dt);
    this.updateZone(dt);
    this.updatePickups(dt, now);
    this.updateParticles(dt);
    this.updateCamera(dt);

    // --- HUD ---
    this.hud.setAlive(this.aliveCount());
    if (p.alive) {
      this.hud.setVitals(p);
      this.hud.setWeapon(p);
      const z = this.zone;
      this.hud.setZone({ ...z, text: z.stateLabel });
      this.hud.setDistrict(this.world._districtAt(p.x, p.y).name);
      this.hud.drawMinimap(this, dt);
    }

    if (this.state === 'over') {
      this.endTimer -= dt;
      if (this.endTimer <= 0 && !this.endShown) {
        this.endShown = true;
        this.showEndScreen();
      }
    }
  }

  updateBullets(dt) {
    const fighters = [];
    if (this.player.alive) fighters.push(this.player);
    for (const b of this.bots) if (b.alive) fighters.push(b);

    const out = [];
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const stepLen = Math.max(10, b.speed * dt / 4);
      const steps = Math.max(1, Math.ceil((b.speed * dt) / stepLen));
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        const px = b.x;
        const py = b.y;
        const nx = px + (b.vx * dt) / steps;
        const ny = py + (b.vy * dt) / steps;

        // fighters
        let hitF = null;
        let hitT = 1;
        for (const f of fighters) {
          if (f === b.owner || !f.alive) continue;
          if (segCircleHit(px, py, nx, ny, f.x, f.y, f.r + 3)) {
            const d = dist(px, py, f.x, f.y);
            const t = clamp(d / Math.max(1, dist(px, py, nx, ny)), 0, 1);
            if (t < hitT) {
              hitT = t;
              hitF = f;
            }
          }
        }

        // walls
        const blocked = this.world.pointBlocked(nx, ny);

        if (hitF && !blocked) {
          this.damageFighter(hitF, b.damage, b.owner, b.angle);
          dead = true;
          b.alive = false;
          break;
        }
        if (blocked) {
          this.sparkBurst(nx, ny, b.angle);
          b.alive = false;
          dead = true;
          break;
        }
        b.x = nx;
        b.y = ny;
        b.travelled += stepLen;
        if (b.travelled > b.range) {
          b.alive = false;
          dead = true;
        }
      }
      if (b.alive) out.push(b);
    }
    this.bullets = out;
    if (this.bullets.length > 400) this.bullets.splice(0, this.bullets.length - 400);
  }

  updateZone(dt) {
    const z = this.zone;
    const prevPhase = z.phase;
    z.update(dt, this);

    if (z.phase !== prevPhase) {
      this.hud.toast('ZONE ' + (z.phase + 1) + ' — MOVE IN', 1800);
      audio.zone();
    }

    if (this.player.alive) {
      const outside = dist(this.player.x, this.player.y, z.x, z.y) > z.radius;
      this.hud.showZoneWarning(outside || (z.state === 'wait' && z.timer < 6) || (z.shrinking && this.time < (this.warningUntil || 0)));
    }

    // damage tick
    this.zoneTick -= dt;
    if (this.zoneTick <= 0) {
      this.zoneTick = 0.5;
      const dmg = z.dps * 0.5;
      const all = [this.player, ...this.bots];
      for (const f of all) {
        if (!f.alive) continue;
        if (dist(f.x, f.y, z.x, z.y) > z.radius) {
          this.damageFighter(f, dmg, null, rand(0, TAU));
          if (f.isPlayer) this.hud.showZoneWarning(true);
        }
      }
    }
  }

  onZoneWarning() {
    this.warningUntil = this.time + 3.2;
    audio.zone();
  }

  updatePickups(dt, now) {
    const p = this.player;
    if (!p.alive) return;
    const prevNear = this.nearLoot;
    this.nearLoot = null;
    for (const it of this.pickups) {
      if (!it.alive) continue;
      // magnet a little
      const d = dist(p.x, p.y, it.x, it.y);
      if (d < 66 && d > 6) {
        it.x += ((p.x - it.x) / d) * Math.min(200 * dt, d - 6);
        it.y += ((p.y - it.y) / d) * Math.min(200 * dt, d - 6);
      }
      if (d < 30) this.collect(it);
      else if (it.type === 'weapon' && d < 62) {
        if (p.slots[0] && p.slots[1] && !p.isSwapping) this.nearLoot = it;
        else this.collect(it);
      }
    }
    this.pickups = this.pickups.filter((i) => i.alive);
    if (this.nearLoot !== prevNear) {
      if (this.nearLoot && this.nearLoot.type === 'weapon') {
        const w = WEAPONS[this.nearLoot.key];
        const cur = WEAPONS[p.slots[p.slot] || 'fists'];
        this.hud.showLootPrompt(`SWAP ${cur.name} → ${w.name}`);
      } else {
        this.hud.showLootPrompt(null);
      }
    }

    // bots collect quietly
    for (const b of this.bots) {
      if (!b.alive) continue;
      for (const it of this.pickups) {
        if (!it.alive) continue;
        if (dist2(b.x, b.y, it.x, it.y) < 34 * 34) {
          this.botCollect(b, it);
        }
      }
    }
  }

  botCollect(b, it) {
    if (it.type === 'weapon') {
      const w = WEAPONS[it.key];
      let slot = -1;
      if (!b.slots[0]) slot = 0;
      else if (!b.slots[1]) slot = 1;
      else if ((w.tier || 1) > (WEAPONS[b.slots[0]].tier || 1)) slot = 0;
      else return;
      b.slots[slot] = it.key;
      b.mags[slot] = w.mag;
      it.alive = false;
      b.pickBestSlot();
      if (!b.slots[b.slot]) b.switchSlot(slot);
    } else if (it.type === 'ammo') {
      b.reserve[it.key] = Math.min(AMMO_MAX[it.key], b.reserve[it.key] + 30);
      it.alive = false;
    } else if (it.type === 'medkit') {
      if (b.medkits >= 3) return;
      b.medkits++;
      it.alive = false;
    } else if (it.type === 'shield') {
      if (b.shield >= 90) return;
      b.shield = Math.min(100, b.shield + 50);
      it.alive = false;
    }
  }

  swapNearbyLoot() {
    const p = this.player;
    const it = this.nearLoot;
    if (!it || !it.alive || it.type !== 'weapon') return;
    if (!p.slots[0] || !p.slots[1]) {
      this.collect(it);
      return;
    }
    const w = WEAPONS[it.key];
    const old = p.slots[p.slot];
    if (old) this.addPickup('weapon', p.x + rand(-26, 26), p.y + rand(-26, 26), { key: old });
    p.slots[p.slot] = it.key;
    p.mags[p.slot] = w.mag;
    p.reserve[w.ammo] = Math.min(AMMO_MAX[w.ammo], p.reserve[w.ammo] + Math.round(w.mag * 1.2));
    p.reloading = false;
    it.alive = false;
    this.nearLoot = null;
    this.hud.showLootPrompt(null);
    audio.pickup();
    this.hud.toast(w.name + ' EQUIPPED', 1000);
  }

  collect(it) {
    const p = this.player;
    if (it.type === 'weapon') {
      const key = it.key;
      const w = WEAPONS[key];
      let slot = -1;
      if (!p.slots[0]) slot = 0;
      else if (!p.slots[1]) slot = 1;
      if (slot === -1) {
        // can't use — convert to ammo of that type
        p.reserve[w.ammo] = Math.min(AMMO_MAX[w.ammo], p.reserve[w.ammo] + 20);
        it.alive = false;
        audio.pickup();
        this.hud.toast(w.name + ' → +20 AMMO', 900);
        return;
      }
      const old = p.slots[slot];
      if (old) this.addPickup('weapon', p.x + rand(-22, 22), p.y + rand(-22, 22), { key: old });
      p.slots[slot] = key;
      p.mags[slot] = w.mag;
      p.switchSlot(slot);
      p.reloading = false;
      p.reserve[w.ammo] = Math.min(AMMO_MAX[w.ammo], p.reserve[w.ammo] + Math.round(w.mag * 1.2));
      it.alive = false;
      audio.pickup();
      this.hud.toast(w.name + ' EQUIPPED', 1100);
    } else if (it.type === 'ammo') {
      const amt = it.key === 'heavy' ? 14 : 30;
      p.reserve[it.key] = Math.min(AMMO_MAX[it.key], p.reserve[it.key] + amt);
      it.alive = false;
      audio.pickup();
      this.hud.toast('+' + amt + ' ' + it.key.toUpperCase() + ' AMMO', 800);
    } else if (it.type === 'medkit') {
      if (p.medkits >= p.maxMedkits) return;
      p.medkits++;
      it.alive = false;
      audio.pickup();
      this.hud.toast('+1 MEDKIT', 800);
    } else if (it.type === 'shield') {
      if (p.shield >= 100) return;
      p.shield = Math.min(100, p.shield + 50);
      it.alive = false;
      audio.pickup();
      this.hud.toast('SHIELD +50', 800);
    }
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - dt * 4;
      pt.vy *= 1 - dt * 4;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);

    for (const n of this.numbers) {
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 1 - dt * 2.4;
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);

    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter((f) => f.life > 0);
  }

  updateCamera(dt) {
    const p = this.player;
    const targetX = p.x + Math.cos(this.input.aimAngle) * 70;
    const targetY = p.y + Math.sin(this.input.aimAngle) * 70;
    const k = 1 - Math.pow(0.0015, dt);
    this.cam.x = lerp(this.cam.x, targetX, k);
    this.cam.y = lerp(this.cam.y, targetY, k);
  }

  // ---------------- render ----------------
  render(dt) {
    const r = this.renderer;
    r.updateShake(dt);
    if (!this.world) {
      // menu backdrop
      const ctx = r.ctx;
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      ctx.clearRect(0, 0, r.w, r.h);
      return;
    }
    r.begin(this.cam);
    r.drawGround(this.world);
    r.drawBushes(this.world);
    r.drawObstacles(this.world, ['crate', 'wall', 'rock']);
    // fighters sorted by y for depth
    const fighters = [];
    if (this.player.alive) fighters.push(this.player);
    for (const b of this.bots) if (b.alive) fighters.push(b);
    fighters.sort((a, b) => a.y - b.y);
    for (const f of fighters) r.drawFighter(f, this.time, f.isPlayer);
    r.drawTreeTrunks(this.world);
    r.drawTreeCanopies(this.world, 0.92, this.player);
    r.drawPickups(this.pickups, this.time);
    r.drawBullets(this.bullets);
    r.drawParticles(this.particles);
    r.drawMuzzleFlash(this.flashes);
    r.drawDamageNumbers(this.numbers);
    r.drawZone(this.zone, this.world, this.time);
    r.end();
    r.drawPost(this.player, this.time);
    this.drawCrosshair();
  }

  drawCrosshair() {
    const ctx = this.renderer.ctx;
    ctx.save();
    ctx.setTransform(this.renderer.dpr, 0, 0, this.renderer.dpr, 0, 0);
    const { x, y } = this.input.mouse;
    const p = this.player;
    if (!p || !p.alive || this.state !== 'playing') {
      ctx.restore();
      return;
    }
    const w = p.weapon;
    const base = w.melee ? 8 : clamp(w.spread * 640, 6, 46) + (p.moving ? 5 : 0) + p.recoil * 3;
    ctx.strokeStyle = 'rgba(240,255,245,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      const x1 = x + Math.cos(a) * base;
      const y1 = y + Math.sin(a) * base;
      const x2 = x + Math.cos(a) * (base + 7);
      const y2 = y + Math.sin(a) * (base + 7);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, TAU);
    ctx.fill();
    if (p.reloading) {
      ctx.strokeStyle = 'rgba(255,210,110,0.95)';
      ctx.lineWidth = 3;
      const prog = clamp((this.time - p.reloadStart) / (w.reload || 1), 0, 1);
      ctx.beginPath();
      ctx.arc(x, y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

window.addEventListener('load', () => {
  window.game = new Game();
});
