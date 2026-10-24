import { ZONE_PHASES } from './config.js';
import { rand, lerp, TAU } from './utils.js';

export class Zone {
  constructor(world) {
    this.world = world;
    this.phase = 0;
    this.x = world.size / 2;
    this.y = world.size / 2;
    this.radius = world.size * 0.72;
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetRadius = this.radius;
    this.fromRadius = this.radius;
    this.fromX = this.x;
    this.fromY = this.y;
    this.timer = 55;
    this.state = 'wait'; // wait | shrink | done
    this.shrinking = false;
    this.shrinkT = 0;
    this.dps = 1;
    this.finished = false;
    this.warned = false;

    this.planNext();
  }

  get phaseData() {
    return ZONE_PHASES[Math.min(this.phase, ZONE_PHASES.length - 1)];
  }

  planNext() {
    if (this.phase >= ZONE_PHASES.length) {
      this.finished = true;
      this.state = 'done';
      return;
    }
    const p = ZONE_PHASES[this.phase];
    const newR = this.world.size * p.radius * 0.5;
    const maxShift = Math.max(0, this.radius - newR);
    const a = rand(0, TAU);
    const shift = maxShift * rand(0.35, 0.9);
    this.targetX = this.x + Math.cos(a) * shift;
    this.targetY = this.y + Math.sin(a) * shift;
    this.targetRadius = newR;
    // keep fully inside the world
    this.targetX = Math.min(Math.max(this.targetX, newR + 100), this.world.size - newR - 100);
    this.targetY = Math.min(Math.max(this.targetY, newR + 100), this.world.size - newR - 100);
    this.timer = p.wait;
    this.state = 'wait';
    this.shrinking = false;
    this.dps = p.dps;
  }

  update(dt, game) {
    if (this.finished) {
      this.shrinking = false;
      return;
    }
    const p = this.phaseData;
    this.timer -= dt;

    if (this.state === 'wait') {
      this.shrinking = false;
      if (this.timer <= 3 && !this.warned) {
        this.warned = true;
        game.onZoneWarning();
      }
      if (this.timer <= 0) {
        this.state = 'shrink';
        this.shrinkT = 0;
        this.fromRadius = this.radius;
        this.fromX = this.x;
        this.fromY = this.y;
        this.warned = false;
      }
    } else if (this.state === 'shrink') {
      this.shrinking = true;
      this.shrinkT += dt;
      const t = Math.min(1, this.shrinkT / p.shrink);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.radius = lerp(this.fromRadius, this.targetRadius, e);
      this.x = lerp(this.fromX, this.targetX, e);
      this.y = lerp(this.fromY, this.targetY, e);
      this.timer = Math.max(0, p.shrink - this.shrinkT);
      if (t >= 1) {
        this.phase++;
        this.planNext();
      }
    }
  }

  /** 0..1 progress for HUD */
  get stateLabel() {
    if (this.finished) return 'FINAL ZONE';
    return this.state === 'wait' ? 'ZONE CLOSES IN' : 'ZONE CLOSING';
  }
}
