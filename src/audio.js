// Tiny procedural audio engine — no external assets needed.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.enabled = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // noise buffer for gunfire
    const len = this.ctx.sampleRate * 0.6;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.enabled = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  now() {
    return this.ctx.currentTime;
  }

  _noise(dur, freq, q, gain, type = 'lowpass') {
    if (!this.enabled || this.muted) return;
    const t = this.now();
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo = null) {
    if (!this.enabled || this.muted) return;
    const t = this.now();
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shoot(weaponKey, volume = 1) {
    if (!this.enabled || this.muted) return;
    const v = 0.5 * volume;
    switch (weaponKey) {
      case 'sniper':
        this._noise(0.35, 900, 1, v * 0.9);
        this._tone(90, 0.28, v * 0.5, 'sawtooth', 40);
        break;
      case 'shotgun':
        this._noise(0.26, 1600, 0.9, v);
        this._tone(120, 0.18, v * 0.45, 'square', 50);
        break;
      case 'ar':
      case 'scar':
        this._noise(0.13, 2400, 1.2, v * 0.8);
        this._tone(150, 0.09, v * 0.3, 'square', 70);
        break;
      case 'smg':
        this._noise(0.08, 3200, 1.5, v * 0.6);
        this._tone(200, 0.05, v * 0.2, 'square', 90);
        break;
      case 'pistol':
        this._noise(0.1, 2800, 1.4, v * 0.65);
        this._tone(180, 0.06, v * 0.22, 'square', 80);
        break;
      default:
        this._noise(0.06, 900, 1, v * 0.35);
    }
  }

  hit() {
    this._noise(0.07, 700, 2, 0.35, 'bandpass');
    this._tone(420, 0.05, 0.12, 'triangle', 260);
  }
  headshot() {
    this._tone(1200, 0.09, 0.16, 'triangle', 700);
    this._noise(0.09, 900, 2, 0.3, 'bandpass');
  }
  hurt() {
    this._noise(0.16, 300, 1.2, 0.4);
    this._tone(140, 0.12, 0.18, 'sawtooth', 70);
  }
  pickup() {
    this._tone(660, 0.07, 0.12, 'triangle');
    setTimeout(() => this._tone(990, 0.09, 0.1, 'triangle'), 60);
  }
  reload() {
    this._noise(0.05, 1800, 3, 0.18, 'bandpass');
    setTimeout(() => this._noise(0.06, 900, 3, 0.2, 'bandpass'), 120);
  }
  heal() {
    this._tone(520, 0.18, 0.12, 'sine', 780);
  }
  kill() {
    this._tone(880, 0.1, 0.16, 'square');
    setTimeout(() => this._tone(1320, 0.16, 0.14, 'square'), 90);
  }
  zone() {
    this._tone(300, 0.5, 0.09, 'sine', 180);
  }
  death() {
    this._tone(220, 0.6, 0.18, 'sawtooth', 60);
  }
  booyah() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.32, 0.16, 'triangle'), i * 130));
  }
  step() {
    if (!this.enabled || this.muted) return;
    this._noise(0.03, 400, 1, 0.05);
  }
}

export const audio = new AudioEngine();
