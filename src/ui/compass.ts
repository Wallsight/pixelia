// A compass strip at the top of the screen, turning with the view. Rare
// creatures and the dance of dragons show on it as red skulls; while one is
// about, an arrow under the strip points the way to the nearest (it turns as
// the player turns) with its name and distance.

const W = 420, H = 92, STRIP = 30;
const LABELS: Array<[number, string]> = [[0, 'K'], [45, 'KD'], [90, 'D'], [135, 'GD'], [180, 'G'], [225, 'GB'], [270, 'B'], [315, 'KB']];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface CompassMark { x: number; z: number; label: string; done: boolean; /** Default: a skull. */ icon?: string }

export class Compass {
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private last = '';

  constructor() {
    this.canvas.id = 'compass';
    this.canvas.width = W * this.dpr;
    this.canvas.height = H * this.dpr;
    this.g = this.canvas.getContext('2d')!;
    document.body.appendChild(this.canvas);
  }

  /** yaw: the player's (looking along -sin, -cos); +z is south. */
  update(yaw: number, px: number, pz: number, marks: CompassMark[], next: number): void {
    // Redraw only when something on it would change (it is a 2D canvas: not free on phones).
    let key = `${Math.round(yaw * 400)}|${Math.round(px * 2)}|${Math.round(pz * 2)}|${Math.floor(next)}`;
    for (const m of marks) key += `|${m.done ? 1 : 0}${m.icon ?? ''}${Math.round(m.x)},${Math.round(m.z)}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.g, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
    const heading = -yaw; // bearing, clockwise from north
    const toX = (bearing: number) => W / 2 + (wrap(bearing - heading) / (Math.PI / 2)) * (W / 2);

    // The strip: fades out at both ends.
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(14,10,20,0)'); grad.addColorStop(0.15, 'rgba(14,10,20,0.62)');
    grad.addColorStop(0.85, 'rgba(14,10,20,0.62)'); grad.addColorStop(1, 'rgba(14,10,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, STRIP);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 15) {
      const b = (deg * Math.PI) / 180;
      if (Math.abs(wrap(b - heading)) > Math.PI / 2) continue;
      const x = toX(b);
      const label = LABELS.find(([a]) => a === deg)?.[1];
      g.globalAlpha = 1 - Math.abs(x - W / 2) / (W / 2) * 0.8;
      if (label) {
        g.font = `bold ${label.length === 1 ? 15 : 11}px "Cascadia Mono", Consolas, monospace`;
        g.fillStyle = label === 'K' ? '#ff8a6a' : '#f4ead8';
        g.fillText(label, x, STRIP / 2);
      } else {
        g.fillStyle = '#c9bfd8';
        g.fillRect(x - 0.5, STRIP / 2 - 3, 1, 6);
      }
    }
    g.globalAlpha = 1;
    // Centre notch.
    g.fillStyle = '#ffd77a';
    g.beginPath(); g.moveTo(W / 2 - 5, 0); g.lineTo(W / 2 + 5, 0); g.lineTo(W / 2, 6); g.closePath(); g.fill();

    // Countdown to the next rare event: under the strip, or under the arrow while one is about.
    const live = marks.some((m) => !m.done);
    const mm = Math.floor(next / 60), ss = Math.floor(next % 60);
    g.font = 'bold 12px "Cascadia Mono", Consolas, monospace';
    const cd = `sonraki nadir olay ${mm}:${String(ss).padStart(2, '0')}`;
    const cdy = live ? H - 8 : STRIP + 12;
    g.fillStyle = '#000';
    g.fillText(cd, W / 2 + 1, cdy + 1);
    g.fillStyle = '#c9bfd8';
    g.fillText(cd, W / 2, cdy);

    // Rare creatures on the strip (pinned to the edge when behind).
    let near: CompassMark | null = null, nd = Infinity;
    for (const m of marks) {
      if (m.done) continue;
      const dist = Math.hypot(m.x - px, m.z - pz);
      if (dist < nd) { nd = dist; near = m; }
      const b = Math.atan2(m.x - px, -(m.z - pz));
      const rel = wrap(b - heading);
      const x = Math.abs(rel) > Math.PI / 2 ? (rel > 0 ? W - 10 : 10) : toX(b);
      g.font = 'bold 16px "Cascadia Mono", Consolas, monospace';
      g.fillStyle = '#000';
      g.fillText(m.icon ?? '☠', x + 1, STRIP / 2 + 1);
      g.fillStyle = '#ff5a4a';
      g.fillText(m.icon ?? '☠', x, STRIP / 2);
    }
    if (!near) return;

    // The way-finding arrow: up = straight ahead, turning with the view.
    const rel = wrap(Math.atan2(near.x - px, -(near.z - pz)) - heading);
    const cx = W / 2 - 70, cy = STRIP + 22;
    g.save();
    g.translate(cx, cy);
    g.rotate(rel);
    g.fillStyle = '#000';
    this.arrow(1.5, 1.5);
    g.fillStyle = Math.abs(rel) < 0.3 ? '#9ae07a' : '#ff6a4a';
    this.arrow(0, 0);
    g.restore();
    g.textAlign = 'left';
    g.font = 'bold 13px "Cascadia Mono", Consolas, monospace';
    const text = `${near.label} · ${Math.round(nd)} m`;
    g.fillStyle = '#000';
    g.fillText(text, cx + 20, cy + 1);
    g.fillStyle = '#ffd8c8';
    g.fillText(text, cx + 19, cy);
  }

  private arrow(ox: number, oy: number): void {
    const g = this.g;
    g.beginPath();
    g.moveTo(ox, oy - 14); g.lineTo(ox + 10, oy + 2); g.lineTo(ox + 4, oy + 1); g.lineTo(ox + 4, oy + 12);
    g.lineTo(ox - 4, oy + 12); g.lineTo(ox - 4, oy + 1); g.lineTo(ox - 10, oy + 2);
    g.closePath(); g.fill();
  }
}
