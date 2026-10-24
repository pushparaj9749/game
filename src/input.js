export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0 };
    this.mouseDown = false;
    this.aimAngle = 0;
    this.onKey = null;

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      const first = !this.keys.has(e.code);
      this.keys.add(e.code);
      if (first && this.onKey) this.onKey(e.code, e);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('touchstart', (e) => {
      if (e.target === canvas) {
        this.mouseDown = true;
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        this.mouse.x = t.clientX - r.left;
        this.mouse.y = t.clientY - r.top;
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches[0];
      if (!t) return;
      this.mouse.x = t.clientX - r.left;
      this.mouse.y = t.clientY - r.top;
    }, { passive: true });
    window.addEventListener('touchend', () => { this.mouseDown = false; }, { passive: true });
  }

  computeAim(camera, player, view) {
    const sx = (player.x - camera.x) * camera.zoom + view.w / 2;
    const sy = (player.y - camera.y) * camera.zoom + view.h / 2;
    this.aimAngle = Math.atan2(this.mouse.y - sy, this.mouse.x - sx);
    return this.aimAngle;
  }
}
