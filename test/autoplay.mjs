// Runs full matches with a simple autopilot to sanity check balance + end conditions.
import { bootGame, clearTimers } from './dom.mjs';
import { WEAPONS } from '../src/config.js';

clearTimers();
const game = await bootGame();

const MATCHES = Number(process.env.MATCHES || 5);
const MAX_FRAMES = 60 * 60 * 8;
const results = [];

function playMatch() {
  game.start();
  const keys = game.input.keys;
  game.input.computeAim = () => 0;
  let frames = 0;
  let medkitsUsed = 0;

  while (frames < MAX_FRAMES) {
    const p = game.player;
    const now = game.time;

    // swap to a better weapon when standing on loot
    if (game.nearLoot && game.nearLoot.alive) {
      const lootTier = WEAPONS[game.nearLoot.key].tier || 1;
      const curTier = p.weapon.tier || 1;
      if (lootTier > curTier) game.swapNearbyLoot();
    }
    // don't run a sniper in close quarters
    if (p.weaponKey === 'sniper' && p.slots[1 - p.slot]) {
      const nearFoe = game.bots.find((b) => b.alive && Math.hypot(b.x - p.x, b.y - p.y) < 340);
      if (nearFoe) p.switchSlot(1 - p.slot);
    }
    // --- decide ---
    let best = null;
    let bestD = Infinity;
    const foes = game.bots.filter((b) => b.alive);
    for (const b of foes) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < 780 && d < bestD && game.world.hasLineOfSight(p.x, p.y, b.x, b.y)) {
        best = b;
        bestD = d;
      }
    }

    keys.clear();
    let aim = p.angle;
    let shoot = false;
    let moveTo = null;

    if (best) {
      // lead the target using bullet travel time (like a decent human would)
      const w = p.weapon;
      const speed = w.speed || 1200;
      const lead = Math.min(0.4, bestD / speed);
      const tx = best.x + (best.vx || 0) * lead;
      const ty = best.y + (best.vy || 0) * lead;
      aim = Math.atan2(ty - p.y, tx - p.x);
      shoot = true;
      // strafe around target at ideal range
      const ideal = 320;
      const err = bestD - ideal;
      const off = Math.sign(err) * Math.min(1, Math.abs(err) / 220);
      const sx = Math.cos(aim) * off;
      const sy = Math.sin(aim) * off;
      const perp = Math.sin(now * 1.6) > 0 ? 1 : -1;
      // always keep moving: strafe + manage range
      const strafeDist = bestD > 430 ? 40 : 110;
      moveTo = {
        x: p.x + sx * 150 + Math.cos(aim + Math.PI / 2) * perp * strafeDist,
        y: p.y + sy * 150 + Math.sin(aim + Math.PI / 2) * perp * strafeDist,
      };
    } else if (p.hp < 60 && p.medkits > 0) {
      p.startHeal(now);
      medkitsUsed++;
    }

    // zone
    const dz = Math.hypot(p.x - game.zone.x, p.y - game.zone.y);
    if (dz > game.zone.radius * 0.72) moveTo = { x: game.zone.x, y: game.zone.y };

    if (!moveTo && !best) {
      // wander toward zone center
      moveTo = { x: game.zone.x, y: game.zone.y };
    }

    if (moveTo) {
      const dx = moveTo.x - p.x;
      const dy = moveTo.y - p.y;
      if (Math.abs(dx) > 30) keys.add(dx > 0 ? 'KeyD' : 'KeyA');
      if (Math.abs(dy) > 30) keys.add(dy > 0 ? 'KeyS' : 'KeyW');
      if (!best && dz > game.zone.radius) keys.add('ShiftLeft');
    }

    game.input.aimAngle = aim;
    // semi-auto weapons need a click per shot, so pulse the trigger
    game.input.mouseDown = shoot && (now * 8) % 1 < 0.55;
    game.update(1 / 60);
    game.render(1 / 60);
    frames++;
    if (game.state === 'over' && game.endShown) break;
  }

  const p = game.player;
  return {
    time: +game.time.toFixed(1),
    won: !!game.won,
    place: game.won ? 1 : game.finalPlace,
    kills: p.kills,
    damage: Math.round(p.damageDealt),
    alive: game.aliveCount(),
    state: game.state,
    medkitsUsed,
  };
}

for (let i = 0; i < MATCHES; i++) {
  const r = playMatch();
  results.push(r);
  console.log('match', i + 1, JSON.stringify(r));
}

const wins = results.filter((r) => r.won).length;
const avgPlace = results.reduce((a, r) => a + r.place, 0) / results.length;
const avgKills = results.reduce((a, r) => a + r.kills, 0) / results.length;
console.log(`SUMMARY wins=${wins}/${MATCHES} avgPlace=${avgPlace.toFixed(1)} avgKills=${avgKills.toFixed(1)}`);
const unfinished = results.filter((r) => r.state !== 'over').length;
if (unfinished) console.log('WARNING: unfinished matches', unfinished);
process.exit(0);
