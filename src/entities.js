import { WEAPONS, SETTINGS, WEAPON_DROPS } from './config.js';
import {
  clamp, rand, randInt, pick, dist, dist2, lerp, lerpAngle, angleDiff, TAU,
} from './utils.js';
import { audio } from './audio.js';

let uid = 1;

export const AMMO_MAX = { light: 240, medium: 240, heavy: 120 };

export class Fighter {
  constructor(game, opts) {
    this.game = game;
    this.id = uid++;
    this.x = opts.x;
    this.y = opts.y;
    this.r = SETTINGS.playerRadius;
    this.name = opts.name || 'Player';
    this.skin = opts.skin || { body: '#3b6fd4', head: '#f2c49b', accent: '#8fd3ff' };
    this.isPlayer = !!opts.isPlayer;
    this.angle = rand(0, TAU);
    this.aimAngle = this.angle;
    this.moveAngle = this.angle;
    this.hp = 100;
    this.maxHp = 100;
    this.shield = 0;
    this.maxShield = 100;
    this.alive = true;
    this.speed = this.isPlayer ? SETTINGS.playerSpeed : SETTINGS.botSpeed;
    this.kills = 0;
    this.damageDealt = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.sprinting = false;
    this.slots = [null, null];
    this.slot = 0;
    this.mags = [0, 0];
    this.reserve = { light: 0, medium: 0, heavy: 0 };
    this.firing = false;
    this.lastShot = -9999;
    this.reloadEnd = 0;
    this.reloading = false;
    this.healEnd = 0;
    this.healing = false;
    this.medkits = 0;
    this.maxMedkits = 5;
    this.hitFlash = 0;
    this.deathTime = 0;
    this.recoil = 0;
    this.stepTimer = 0;
    this.lastHitBy = null;
    this.lastHitTime = 0;
    // bots get a starter pistol sometimes
    if (!this.isPlayer) {
      this.slots[0] = pick(['pistol', 'pistol', 'smg', 'ar', 'shotgun', 'smg', 'ar', 'sniper']);
      this.mag = WEAPONS[this.slots[0]].mag;
      this.reserve.light = randInt(20, 90);
      this.reserve.medium = randInt(20, 70);
      this.reserve.heavy = randInt(4, 18);
      this.medkits = randInt(0, 2);
      this.shield = pick([0, 0, 0, 25, 50]);
    }
  }

  get mag() {
    return this.mags[this.slot] || 0;
  }
  set mag(v) {
    this.mags[this.slot] = v;
  }

  get weapon() {
    return WEAPONS[this.slots[this.slot] || 'fists'] || WEAPONS.fists;
  }
  get weaponKey() {
    return this.slots[this.slot] || 'fists';
  }

  canFire(now) {
    const w = this.weapon;
    if (this.reloading || this.healing || !this.alive) return false;
    if (now - this.lastShot < w.rate / 1000) return false;
    if (!w.melee && this.mag <= 0) {
      this.startReload(now);
      return false;
    }
    return true;
  }

  fire(now, aim, targetAngle = null) {
    if (!this.canFire(now)) return false;
    const w = this.weapon;
    this.lastShot = now;
    this.recoil = Math.min(6, this.recoil + (w.recoil || 1.5) * 0.55);
    if (w.melee) {
      this.game.meleeSwing(this, aim);
      return true;
    }
    this.mag--;
    const baseAngle = targetAngle ?? aim;
    for (let p = 0; p < w.pellets; p++) {
      const spread = w.spread * (this.moving ? 1.25 : 1) * (this.sprinting ? 1.45 : 1);
      const a = baseAngle + rand(-spread, spread);
      const muzzle = 26;
      const bx = this.x + Math.cos(aim) * muzzle;
      const by = this.y + Math.sin(aim) * muzzle;
      this.game.spawnBullet({
        x: bx, y: by, angle: a, speed: rand(w.speed * 0.94, w.speed * 1.06),
        damage: w.damage, owner: this, range: w.range, weaponKey: this.weaponKey,
      });
    }
    this.game.spawnMuzzleFlash(this.x + Math.cos(aim) * 28, this.y + Math.sin(aim) * 28, aim, w);
    if (this.isPlayer) {
      this.game.shake(w.recoil * 1.6 + 2.4);
      audio.shoot(this.weaponKey, 1);
    } else {
      const d = dist(this.x, this.y, this.game.player.x, this.game.player.y);
      const vol = clamp(1 - d / 1700, 0, 1);
      if (vol > 0.05) audio.shoot(this.weaponKey, vol * 0.55);
    }
    if (this.mag <= 0) this.startReload(now);
    return true;
  }

  startReload(now) {
    const w = this.weapon;
    if (w.melee || this.reloading) return;
    if (this.mag >= w.mag) return;
    if (!this.reserve[w.ammo] && this.mag <= 0) return;
    this.reloading = true;
    this.reloadStart = now;
    this.reloadEnd = now + w.reload;
    this.healing = false;
    if (this.isPlayer) audio.reload();
  }

  finishReload() {
    const w = this.weapon;
    const need = w.mag - this.mag;
    const have = this.reserve[w.ammo] || 0;
    const take = Math.min(need, have);
    this.mag += take;
    this.reserve[w.ammo] = have - take;
    this.reloading = false;
  }

  startHeal(now) {
    if (this.healing || this.reloading || this.medkits <= 0) return;
    if (this.hp >= this.maxHp) return;
    this.healing = true;
    this.healStart = now;
    this.healEnd = now + 2.6;
    if (this.isPlayer) audio.heal();
  }

  finishHeal() {
    this.healing = false;
    this.medkits = Math.max(0, this.medkits - 1);
    this.hp = Math.min(this.maxHp, this.hp + 55);
  }

  switchSlot(i) {
    if (i === this.slot) return;
    if (!this.slots[i]) return;
    this.slot = i;
    this.reloading = false;
    this.healing = false;
  }

  takeDamage(amount, from = null, opts = {}) {
    if (!this.alive) return;
    let dmg = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.hitFlash = 1;
    this.healing = false;
    if (from) {
      this.lastHitBy = from;
      this.lastHitTime = this.game.time;
      from.damageDealt = (from.damageDealt || 0) + amount;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTime = this.game.time;
      this.game.onDeath(this, from);
    }
  }

  updateTimers(now, dt) {
    if (this.reloading && now >= this.reloadEnd) this.finishReload();
    if (this.healing && now >= this.healEnd) this.finishHeal();
    this.recoil = lerp(this.recoil, 0, Math.min(1, dt * 10));
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
  }

  pulse(now) {
    return Math.sin(now * 7) * 0.5 + 0.5;
  }
}

export class Player extends Fighter {
  constructor(game, x, y, name) {
    super(game, { x, y, name, isPlayer: true });
    this.slots[0] = 'pistol';
    this.slots[1] = null;
    this.mag = WEAPONS.pistol.mag;
    this.reserve.light = 90;
    this.reserve.medium = 40;
    this.shield = 50;
    this.medkits = 2;
  }

  update(dt, now, input) {
    if (!this.alive) return;
    this.aimAngle = input.aimAngle;
    this.angle = input.aimAngle;

    let mx = 0;
    let my = 0;
    if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) my -= 1;
    if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) my += 1;
    if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mx -= 1;
    if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mx += 1;
    const mag = Math.hypot(mx, my);
    this.moving = mag > 0;
    this.sprinting = this.moving && (input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')) && !this.firing;

    if (this.moving) {
      mx /= mag;
      my /= mag;
      this.moveAngle = Math.atan2(my, mx);
      let sp = this.speed * (this.sprinting ? SETTINGS.sprintMul : 1);
      if (this.healing) sp *= 0.45;
      if (this.recoil > 0.2) sp *= 0.92;
      this.x += mx * sp * dt;
      this.y += my * sp * dt;
      this.walkPhase += dt * (this.sprinting ? 15 : 10);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = this.sprinting ? 0.26 : 0.36;
        audio.step();
        this.game.spawnDust(this.x, this.y);
      }
    }

    this.game.world.resolveCircle(this, this.r);

    // shooting
    const wantFire = input.mouseDown;
    if (wantFire && this.canFire(now)) {
      const w = this.weapon;
      if (w.auto) {
        this.fire(now, this.aimAngle);
      } else if (!this._shotLatch) {
        this.fire(now, this.aimAngle);
        this._shotLatch = true;
      }
    }
    if (!wantFire) this._shotLatch = false;
  }
}

export class Bot extends Fighter {
  constructor(game, x, y, name, skin) {
    super(game, { x, y, name, skin });
    this.state = 'wander';
    this.target = null;
    this.thinkTimer = rand(0, 0.4);
    this.moveTarget = null;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 0;
    this.skill = rand(0.55, 1);
    this.reactionTimer = 0;
    this.aimJitter = rand(0.055, 0.135) * (1.35 - this.skill);
    this.smoothAim = this.angle;
    this.lootTarget = null;
    this.wanderTimer = 0;
    this.zoneUrgency = 0;
    this.burstLeft = randInt(3, 7);
    this.burstPause = 0;
  }

  update(dt, now) {
    if (!this.alive) return;
    this.updateTimers(now, dt);

    // zone awareness
    const zone = this.game.zone;
    const dToCenter = dist(this.x, this.y, zone.x, zone.y);
    const outside = dToCenter > zone.radius - 60;
    const needsZone = outside || (zone.shrinking && dToCenter > zone.radius * 0.78);

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = rand(0.22, 0.5);
      this.think(now, needsZone);
    }

    let mx = 0;
    let my = 0;
    if (this.moveTarget) {
      const d = dist(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
      if (d > 22) {
        mx = (this.moveTarget.x - this.x) / d;
        my = (this.moveTarget.y - this.y) / d;
      } else {
        this.moveTarget = null;
      }
    }
    // separation from other bots
    for (const o of this.game.bots) {
      if (o === this || !o.alive) continue;
      const dd = dist2(this.x, this.y, o.x, o.y);
      if (dd < 46 * 46) {
        const d = Math.sqrt(dd) || 1;
        mx += ((this.x - o.x) / d) * 0.5;
        my += ((this.y - o.y) / d) * 0.5;
      }
    }

    const mag = Math.hypot(mx, my);
    this.moving = mag > 0.05;
    this.sprinting = this.moving && (needsZone || this.state === 'rotate') && !this.target;
    if (this.moving) {
      mx /= mag || 1;
      my /= mag || 1;
      this.moveAngle = Math.atan2(my, mx);
      const sp = this.speed * (this.sprinting ? 1.35 : 1) * (this.healing ? 0.5 : 1);
      this.x += mx * sp * dt;
      this.y += my * sp * dt;
      this.walkPhase += dt * (this.sprinting ? 13 : 9);
    }
    this.game.world.resolveCircle(this, this.r);

    this.updateAim(dt, now);
    this.combat(now, dt);
  }

  think(now, needsZone) {
    const G = this.game;
    // find nearest visible enemy
    let best = null;
    let bestD = Infinity;
    const check = (f) => {
      if (!f.alive || f === this) return;
      const d = dist(this.x, this.y, f.x, f.y);
      if (d > 1100 || d > bestD) return;
      if (!G.world.hasLineOfSight(this.x, this.y, f.x, f.y)) return;
      best = f;
      bestD = d;
    };
    check(G.player);
    for (const b of G.bots) check(b);

    if (best && bestD < (this.weapon.range || 700) * 0.95) {
      if (this.target !== best) this.reactionTimer = rand(0.3, 0.62) * (1.45 - this.skill);
      this.target = best;
      this.state = 'fight';

      const ideal = this.weapon.melee ? 30 : clamp(this.weapon.range * 0.42, 160, 560);
      const ang = Math.atan2(best.y - this.y, best.x - this.x);
      const err = bestD - ideal;
      let tx = this.x + Math.cos(ang) * err * 0.7;
      let ty = this.y + Math.sin(ang) * err * 0.7;
      // strafe
      this.strafeTimer -= 0.3;
      if (this.strafeTimer <= 0) {
        this.strafeTimer = rand(0.7, 1.7);
        this.strafeDir *= -1;
      }
      tx += Math.cos(ang + Math.PI / 2) * this.strafeDir * 130;
      ty += Math.sin(ang + Math.PI / 2) * this.strafeDir * 130;
      const jitter = rand(-60, 60);
      this.moveTarget = { x: clamp(tx + jitter, 40, G.world.size - 40), y: clamp(ty + jitter, 40, G.world.size - 40) };
      return;
    }

    this.target = null;

    if (needsZone) {
      const a = rand(0, TAU);
      const rr = Math.max(0, G.zone.radius * rand(0.15, 0.55));
      this.moveTarget = { x: G.zone.x + Math.cos(a) * rr, y: G.zone.y + Math.sin(a) * rr };
      this.state = 'rotate';
      return;
    }

    // loot nearby
    let loot = null;
    let ld = Infinity;
    for (const it of G.pickups) {
      if (!it.alive) continue;
      if (it.type === 'weapon' && this.slots[0] && this.slots[1]) continue;
      if (it.type === 'medkit' && this.medkits >= 2) continue;
      const d = dist(this.x, this.y, it.x, it.y);
      if (d < 700 && d < ld) {
        ld = d;
        loot = it;
      }
    }
    if (loot && Math.random() < 0.75) {
      this.moveTarget = { x: loot.x, y: loot.y };
      this.state = 'loot';
      return;
    }

    // wander toward zone or random point
    if (!this.moveTarget || Math.random() < 0.25) {
      const a = rand(0, TAU);
      const rr = G.zone.radius * rand(0, 0.8);
      const p = G.world.randomOpenPoint(80);
      const useZone = Math.random() < 0.6;
      this.moveTarget = useZone
        ? { x: clamp(G.zone.x + Math.cos(a) * rr, 60, G.world.size - 60), y: clamp(G.zone.y + Math.sin(a) * rr, 60, G.world.size - 60) }
        : p;
      this.state = 'wander';
    }
  }

  updateAim(dt, now) {
    if (this.target && this.target.alive) {
      const t = this.target;
      const w = this.weapon;
      const bulletSpeed = w.speed || 1200;
      const d = dist(this.x, this.y, t.x, t.y);
      const lead = Math.min(0.35, d / bulletSpeed);
      const tx = t.x + (t.vx || 0) * lead;
      const ty = t.y + (t.vy || 0) * lead;
      const want = Math.atan2(ty - this.y, tx - this.x);
      const jitter = this.aimJitter * (this.moving ? 1.4 : 1);
      this.smoothAim = lerpAngle(this.smoothAim, want + rand(-jitter, jitter), Math.min(1, dt * (7 + this.skill * 9)));
      this.angle = lerpAngle(this.angle, this.smoothAim, Math.min(1, dt * 16));
      this.aimAngle = this.angle;
    } else {
      const targetA = this.moving ? this.moveAngle : this.angle;
      this.angle = lerpAngle(this.angle, targetA, Math.min(1, dt * 8));
      this.aimAngle = this.angle;
    }
  }

  combat(now, dt) {
    if (this.healing || this.reloading) return;
    const w = this.weapon;
    if (!this.target || !this.target.alive) {
      this.reactionTimer = 0;
      if (this.mag < w.mag * 0.45 && this.reserve[w.ammo] > 0) this.startReload(now);
      return;
    }
    const t = this.target;
    const d = dist(this.x, this.y, t.x, t.y);
    if (d > (w.range || 600) * 1.05) return;

    this.reactionTimer -= dt;
    if (this.reactionTimer > 0) return;

    const want = Math.atan2(t.y - this.y, t.x - this.x);
    if (Math.abs(angleDiff(this.angle, want)) > (w.melee ? 0.6 : 0.15)) return;
    if (w.melee) {
      if (d < 46) this.fire(now, this.angle);
      return;
    }
    if (now - this.lastShot < w.rate / 1000) return;

    // burst discipline for automatic weapons
    if (now < this.burstPause) return;
    if (w.auto) {
      this.burstLeft -= 1;
      if (this.burstLeft <= 0) {
        this.burstLeft = randInt(3, 8);
        this.burstPause = now + rand(0.28, 0.75);
      }
    }

    // distance based inaccuracy so bots are not laser-accurate at range
    const err = (0.028 + d * 0.00010) * (1.4 - this.skill);
    this.fire(now, this.angle + rand(-err, err));
  }

  pickBestSlot() {
    // choose the highest tier weapon with ammo
    let bestIdx = -1;
    let bestScore = -1;
    this.slots.forEach((s, i) => {
      if (!s) return;
      const w = WEAPONS[s];
      const ammo = i === this.slot ? this.mag : this.reserve[w.ammo];
      const score = w.tier * 10 + Math.min(20, ammo) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestIdx !== this.slot && this.slots[bestIdx]) {
      this.switchSlot(bestIdx);
    }
  }
}

export class Bullet {
  constructor(o) {
    this.x = o.x;
    this.y = o.y;
    this.px = o.x;
    this.py = o.y;
    this.angle = o.angle;
    this.speed = o.speed;
    this.vx = Math.cos(o.angle) * o.speed;
    this.vy = Math.sin(o.angle) * o.speed;
    this.damage = o.damage;
    this.owner = o.owner;
    this.range = o.range;
    this.travelled = 0;
    this.alive = true;
    this.weaponKey = o.weaponKey;
  }
}
