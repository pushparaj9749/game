import { WEAPONS } from './config.js';
import { clamp, fmtTime, TAU } from './utils.js';

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.alive = document.getElementById('aliveCount');
    this.kills = document.getElementById('killCount');
    this.healthFill = document.getElementById('healthFill');
    this.healthNum = document.getElementById('healthNum');
    this.shieldFill = document.getElementById('shieldFill');
    this.shieldNum = document.getElementById('shieldNum');
    this.magCount = document.getElementById('magCount');
    this.reserveCount = document.getElementById('reserveCount');
    this.weaponLabel = document.getElementById('weaponLabel');
    this.weaponName = document.getElementById('weaponName');
    this.weaponSlots = document.getElementById('weaponSlots');
    this.medCount = document.getElementById('medCount');
    this.killfeed = document.getElementById('killfeed');
    this.zoneLabel = document.getElementById('zoneLabel');
    this.zoneTimer = document.getElementById('zoneTimer');
    this.zoneChip = this.zoneLabel.parentElement;
    this.zoneWarning = document.getElementById('zoneWarning');
    this.playerName = document.getElementById('playerName');
    this.district = document.getElementById('districtName');
    this.toastEl = document.getElementById('toast');
    this.hint = document.getElementById('hintBar');
    this.lootPrompt = document.getElementById('lootPrompt');
    this.lootPromptText = document.getElementById('lootPromptText');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this._cache = {};
    this._toastTimer = null;
    this._slotsHtml = '';
    this.minimapTimer = 0;
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setAlive(n) {
    if (this._cache.alive !== n) {
      this._cache.alive = n;
      this.alive.textContent = n;
    }
  }
  setKills(n) {
    if (this._cache.kills !== n) {
      this._cache.kills = n;
      this.kills.textContent = n;
    }
  }

  setVitals(player) {
    const hp = Math.max(0, Math.round(player.hp));
    const sh = Math.max(0, Math.round(player.shield));
    if (this._cache.hp !== hp) {
      this._cache.hp = hp;
      this.healthFill.style.width = hp + '%';
      this.healthNum.textContent = hp;
      this.healthFill.classList.toggle('low', hp < 35);
    }
    if (this._cache.sh !== sh) {
      this._cache.sh = sh;
      this.shieldFill.style.width = sh + '%';
      this.shieldNum.textContent = sh;
    }
    if (this._cache.med !== player.medkits) {
      this._cache.med = player.medkits;
      this.medCount.textContent = player.medkits;
    }
  }

  setWeapon(player) {
    const w = player.weapon;
    const mag = player.reloading ? '···' : player.mag;
    const res = w.melee ? '—' : (player.reserve[w.ammo] || 0);
    if (this._cache.wkey !== player.weaponKey || this._cache.mag !== mag || this._cache.res !== res) {
      this._cache.wkey = player.weaponKey;
      this._cache.mag = mag;
      this._cache.res = res;
      this.weaponLabel.textContent = w.label || 'MELEE';
      this.weaponName.textContent = w.name;
      this.magCount.textContent = mag;
      this.reserveCount.textContent = res;
      this.magCount.classList.toggle('empty', !w.melee && player.mag === 0);
    }
    const slotsKey = player.slots.join(',') + '|' + player.slot;
    if (this._slotsHtml !== slotsKey) {
      this._slotsHtml = slotsKey;
      this.weaponSlots.innerHTML = [0, 1].map((i) => {
        const key = player.slots[i];
        const name = key ? WEAPONS[key].name : 'EMPTY';
        const cls = ['wslot', player.slot === i ? 'active' : '', key ? '' : 'empty'].join(' ');
        return `<div class="${cls}">${i + 1} ${name}</div>`;
      }).join('');
    }
  }

  setZone(zone) {
    const label = zone.text;
    if (this._cache.zLabel !== label) {
      this._cache.zLabel = label;
      this.zoneLabel.textContent = label;
    }
    const t = fmtTime(zone.timer);
    if (this._cache.zTime !== t) {
      this._cache.zTime = t;
      this.zoneTimer.textContent = t;
    }
    this.zoneChip.classList.toggle('danger', zone.state === 'shrink' || zone.timer < 10);
  }

  showZoneWarning(on) {
    this.zoneWarning.classList.toggle('hidden', !on);
  }

  setDistrict(name) {
    if (this._cache.district !== name) {
      this._cache.district = name;
      this.district.textContent = name.toUpperCase();
      this.district.style.opacity = 1;
    }
  }

  feed(killer, victim, isPlayerKiller, isPlayerVictim) {
    const div = document.createElement('div');
    div.className = 'kf-item';
    const k = `<span class="${isPlayerKiller ? 'me' : ''}">${escapeHtml(killer)}</span>`;
    const v = `<span class="${isPlayerVictim ? 'you' : ''}">${escapeHtml(victim)}</span>`;
    div.innerHTML = `${k} &nbsp;⌖&nbsp; ${v}`;
    this.killfeed.appendChild(div);
    while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 400);
    }, 4600);
  }

  toast(text, ms = 1600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  hideHint() { this.hint.classList.add('hidden'); }

  showLootPrompt(text) {
    if (!text) {
      this.lootPrompt.classList.add('hidden');
      return;
    }
    if (this._cache.loot !== text) {
      this._cache.loot = text;
      this.lootPromptText.textContent = text;
    }
    this.lootPrompt.classList.remove('hidden');
  }

  drawMinimap(game, dt) {
    this.minimapTimer -= dt;
    if (this.minimapTimer > 0) return;
    this.minimapTimer = 0.08;
    const c = this.mctx;
    const S = this.minimap.width;
    const world = game.world;
    const sc = S / world.size;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#1d3323';
    c.fillRect(0, 0, S, S);

    // roads
    c.fillStyle = '#38403c';
    for (const r of world.roads) c.fillRect(r.x * sc, r.y * sc, r.w * sc, r.h * sc);
    // buildings
    c.fillStyle = '#6d6a5c';
    for (const f of world.floors) c.fillRect(f.x * sc, f.y * sc, f.w * sc, f.h * sc);

    // zone
    const z = game.zone;
    c.save();
    c.beginPath();
    c.rect(0, 0, S, S);
    c.arc(z.x * sc, z.y * sc, z.radius * sc, 0, TAU, true);
    c.fillStyle = 'rgba(170,25,60,0.45)';
    c.fill('evenodd');
    c.restore();
    c.beginPath();
    c.arc(z.x * sc, z.y * sc, Math.max(1, z.radius * sc), 0, TAU);
    c.strokeStyle = 'rgba(160,230,255,0.85)';
    c.lineWidth = 1.6;
    c.stroke();
    if (z.state === 'wait' && !z.finished) {
      c.beginPath();
      c.arc(z.targetX * sc, z.targetY * sc, Math.max(1, z.targetRadius * sc), 0, TAU);
      c.setLineDash([3, 3]);
      c.strokeStyle = 'rgba(255,255,255,0.75)';
      c.lineWidth = 1.2;
      c.stroke();
      c.setLineDash([]);
    }

    // enemy gunfire blips
    const now = game.time;
    c.fillStyle = 'rgba(255,90,70,0.9)';
    for (const b of game.bots) {
      if (!b.alive) continue;
      if (now - b.lastShot < 1.6 && now - b.lastShot > 0) {
        c.beginPath();
        c.arc(b.x * sc, b.y * sc, 2.4, 0, TAU);
        c.fill();
      }
    }

    // player
    const p = game.player;
    if (p.alive) {
      c.save();
      c.translate(p.x * sc, p.y * sc);
      c.rotate(p.angle);
      c.fillStyle = '#7ff0a3';
      c.beginPath();
      c.moveTo(6, 0);
      c.lineTo(-4, 4);
      c.lineTo(-4, -4);
      c.closePath();
      c.fill();
      c.restore();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
