// Full-screen world map (M): terrain tiles from a worker, roads / sites / player drawn on top.

import type { MapRequest, MapTile } from '../world/map-worker';
import { LM, SITE_CASTLE, SITE_CITY, SITE_ORC, SITE_VILLAGE, type Site } from '../world/structures';
import type { Terrain } from '../world/terrain';
import { castleHouse } from '../world/castle';
import { FOG_CELL, LANDMARK_NAMES, landmarkId, siteId, type Discovery } from './discovery';

const TILE_PX = 128;
const ZOOMS = [1, 2, 4, 8, 16]; // blocks per map pixel
const MAX_CACHE = 400;

export class WorldMap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private worker: Worker;
  private tiles = new Map<string, HTMLCanvasElement>();
  private pending = new Set<string>();
  private zoomIndex = 1;
  /** World position at the map centre, relative to the player when following. */
  private panX = 0;
  private panZ = 0;
  open = false;
  private fog = document.createElement('canvas');
  private fogKey = '';
  private legend: HTMLDivElement;
  /** Live world events to mark (rare creatures), set by main. */
  markers: () => Array<{ x: number; z: number; label: string; done: boolean }> = () => [];

  constructor(seed: number, private terrain: Terrain, private disc: Discovery) {
    this.el = document.createElement('div');
    this.el.id = 'map';
    this.el.className = 'hidden';
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    this.legend = document.createElement('div');
    this.legend.className = 'map-legend';
    this.setTouch(false);
    this.el.appendChild(this.legend);
    document.body.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d')!;

    this.worker = new Worker(new URL('../world/map-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<MapTile>) => this.onTile(e.data);
    const init: MapRequest = { type: 'init', seed };
    this.worker.postMessage(init);

    window.addEventListener('wheel', (e) => {
      if (this.open) this.zoom(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('mousemove', (e) => {
      if (this.open) this.pan(e.movementX, e.movementY);
    });
  }

  /** Switches the legend between touch and mouse/keyboard hints. */
  setTouch(on: boolean): void {
    this.legend.textContent = on
      ? 'Sürükle: kaydır · İki parmak: yakınlaş · HARİTA: kapat'
      : 'Tekerlek: yakınlaş · Fare: kaydır · C: ortala · M: kapat';
  }

  /** Drags the map by a screen-pixel delta. */
  pan(dx: number, dy: number): void {
    const step = ZOOMS[this.zoomIndex];
    this.panX -= dx * step;
    this.panZ -= dy * step;
  }

  /** +1 zooms out, -1 zooms in. */
  zoom(dir: number): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomIndex + dir));
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (this.open) { this.panX = 0; this.panZ = 0; }
  }

  recenter(): void { this.panX = 0; this.panZ = 0; }

  private onTile(t: MapTile): void {
    this.pending.delete(t.key);
    const c = document.createElement('canvas');
    c.width = c.height = t.size;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(t.rgba), t.size, t.size), 0, 0);
    this.tiles.set(t.key, c);
    if (this.tiles.size > MAX_CACHE) this.tiles.delete(this.tiles.keys().next().value!);
  }

  draw(px: number, pz: number, yaw: number): void {
    if (!this.open) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const W = Math.floor(this.el.clientWidth * dpr), H = Math.floor(this.el.clientHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const g = this.ctx;
    const step = ZOOMS[this.zoomIndex];
    const scale = dpr; // screen pixels per map pixel
    const cx = px + this.panX, cz = pz + this.panZ;
    // world -> screen
    const sx = (x: number) => W / 2 + ((x - cx) / step) * scale;
    const sz = (z: number) => H / 2 + ((z - cz) / step) * scale;

    g.imageSmoothingEnabled = false;
    g.fillStyle = '#1b1828';
    g.fillRect(0, 0, W, H);

    // Terrain tiles.
    const span = TILE_PX * step;
    const halfW = (W / 2 / scale) * step, halfH = (H / 2 / scale) * step;
    const tx0 = Math.floor((cx - halfW) / span), tx1 = Math.floor((cx + halfW) / span);
    const tz0 = Math.floor((cz - halfH) / span), tz1 = Math.floor((cz + halfH) / span);
    const want: Array<[number, number, string]> = [];
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${step}:${tx}:${tz}`;
        const tile = this.tiles.get(key);
        if (tile) g.drawImage(tile, sx(tx * span), sz(tz * span), TILE_PX * scale + 1, TILE_PX * scale + 1);
        else if (!this.pending.has(key)) want.push([tx, tz, key]);
      }
    }
    // Request the nearest missing tiles first, a few at a time.
    want.sort((a, b) => Math.hypot(a[0] * span - cx, a[1] * span - cz) - Math.hypot(b[0] * span - cx, b[1] * span - cz));
    for (const [tx, tz, key] of want.slice(0, Math.max(0, 6 - this.pending.size))) {
      this.pending.add(key);
      const req: MapRequest = { type: 'tile', key, x0: tx * span, z0: tz * span, step, size: TILE_PX };
      this.worker.postMessage(req);
    }

    // Roads.
    const x0 = cx - halfW, x1 = cx + halfW, z0 = cz - halfH, z1 = cz + halfH;
    const st = this.terrain.structures;
    g.strokeStyle = '#7a5a3a';
    g.lineWidth = Math.max(1.5, (3 / step) * scale);
    g.lineJoin = 'round';
    for (const road of st.roadsNear(x0, z0, x1, z1, 0)) {
      g.beginPath();
      for (let i = 0; i < road.pts.length; i += 2) {
        const X = sx(road.pts[i]), Y = sz(road.pts[i + 1]);
        if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.stroke();
    }

    // Fog of war over everything not yet explored (roads included).
    this.drawFog(g, cx, cz, halfW, halfH, step, scale, W, H);

    // Sites with labels.
    const font = Math.round(12 * dpr);
    g.font = `bold ${font}px "Cascadia Mono", Consolas, monospace`;
    g.textAlign = 'center';
    for (const s of st.sitesNear(x0, z0, x1, z1, 0)) {
      if (this.disc.found.has(siteId(s)) || this.disc.rumors.has(siteId(s)) || this.disc.isSeen(s.x, s.z)) this.drawSite(g, s, sx(s.x), sz(s.z), dpr, step);
    }

    // Landmarks: found ones show their name, rumoured or glimpsed ones a "?".
    {
      const big = `bold ${Math.round(17 * dpr)}px "Cascadia Mono", Consolas, monospace`;
      for (const lm of this.terrain.landmarks.near(x0, z0, x1, z1, 0)) {
        const id = landmarkId(lm);
        const found = this.disc.found.has(id), rumor = this.disc.rumors.has(id);
        if (!found && !rumor && !this.disc.isSeen(lm.x, lm.z)) continue;
        if (step > 8 && !found && !rumor) continue;
        const X = sx(lm.x), Y = sz(lm.z);
        const label = found ? (lm.kind === LM.GRAVEYARD ? '✝' : lm.kind === LM.DARK_TOWER ? '◉' : '★') : '?';
        g.font = big;
        g.fillStyle = '#2b1d33';
        g.fillText(label, X + dpr, Y + 5 * dpr);
        g.fillStyle = found ? (lm.kind === LM.DARK_TOWER ? '#ff7a3a' : '#a8f0c0') : rumor ? '#ffb070' : '#ffd77a';
        g.fillText(label, X, Y + 4 * dpr);
        if (found && step <= 8) {
          g.font = `bold ${font}px "Cascadia Mono", Consolas, monospace`;
          const name = LANDMARK_NAMES[lm.kind];
          g.fillStyle = '#2b1d33';
          g.fillText(name, X + dpr, Y - 9 * dpr);
          g.fillStyle = '#e8f8ee';
          g.fillText(name, X, Y - 10 * dpr);
        }
      }
      g.font = `bold ${font}px "Cascadia Mono", Consolas, monospace`;
    }

    // Rare creatures: a red skull with the beast's name (grey once it has fallen).
    for (const m of this.markers()) {
      const X = sx(m.x), Y = sz(m.z);
      const pulse = m.done ? 1 : 1 + 0.18 * Math.sin(performance.now() / 180);
      g.font = `bold ${Math.round(20 * dpr * pulse)}px "Cascadia Mono", Consolas, monospace`;
      g.fillStyle = '#2b1d33';
      g.fillText('☠', X + dpr, Y + 7 * dpr);
      g.fillStyle = m.done ? '#9a90a8' : '#ff5a4a';
      g.fillText('☠', X, Y + 6 * dpr);
      g.font = `bold ${font}px "Cascadia Mono", Consolas, monospace`;
      g.fillStyle = '#2b1d33';
      g.fillText(m.label, X + dpr, Y - 11 * dpr);
      g.fillStyle = m.done ? '#c8c0d4' : '#ffc0b0';
      g.fillText(m.label, X, Y - 12 * dpr);
    }

    // Player arrow (forward = -sin(yaw), -cos(yaw) in world XZ).
    const PX = sx(px), PZ = sz(pz);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const r = 9 * dpr;
    g.beginPath();
    g.moveTo(PX + fx * r, PZ + fz * r);
    g.lineTo(PX - fx * r * 0.6 - fz * r * 0.6, PZ - fz * r * 0.6 + fx * r * 0.6);
    g.lineTo(PX - fx * r * 0.2, PZ - fz * r * 0.2);
    g.lineTo(PX - fx * r * 0.6 + fz * r * 0.6, PZ - fz * r * 0.6 - fx * r * 0.6);
    g.closePath();
    g.fillStyle = '#ff6f91';
    g.strokeStyle = '#2b1d33';
    g.lineWidth = 2 * dpr;
    g.fill();
    g.stroke();

    // Compass + scale.
    g.textAlign = 'left';
    g.fillStyle = '#f4ecd8';
    g.fillText('K ↑', 16 * dpr, 28 * dpr);
    const barBlocks = step * 100;
    g.fillRect(16 * dpr, H - 30 * dpr, 100 * scale, 3 * dpr);
    g.fillText(`${barBlocks} m`, 16 * dpr, H - 38 * dpr);
    g.textAlign = 'right';
    g.fillText(`${Math.round(px)}, ${Math.round(pz)}`, W - 16 * dpr, 28 * dpr);
  }

  /** Unexplored cells drawn as soft dusk-coloured fog (one pixel per fog cell, smoothed when scaled). */
  private drawFog(g: CanvasRenderingContext2D, cx: number, cz: number, halfW: number, halfH: number, step: number, scale: number, W: number, H: number): void {
    const c0 = Math.floor((cx - halfW) / FOG_CELL) - 1, c1 = Math.floor((cx + halfW) / FOG_CELL) + 1;
    const r0 = Math.floor((cz - halfH) / FOG_CELL) - 1, r1 = Math.floor((cz + halfH) / FOG_CELL) + 1;
    const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
    const fk = `${c0},${r0},${cols},${rows},${this.disc.version}`;
    if (fk !== this.fogKey) {
      this.fogKey = fk;
      this.fog.width = cols; this.fog.height = rows;
      const fg = this.fog.getContext('2d')!;
      const img = fg.createImageData(cols, rows);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (this.disc.seenCell(c0 + c, r0 + r)) continue;
        const i = (r * cols + c) * 4;
        img.data[i] = 40; img.data[i + 1] = 34; img.data[i + 2] = 56; img.data[i + 3] = 236;
      }
      fg.putImageData(img, 0, 0);
    }
    const px = (FOG_CELL / step) * scale;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, W / 2 + ((c0 * FOG_CELL - cx) / step) * scale, H / 2 + ((r0 * FOG_CELL - cz) / step) * scale, cols * px, rows * px);
    g.imageSmoothingEnabled = false;
  }

  private drawSite(g: CanvasRenderingContext2D, s: Site, X: number, Y: number, dpr: number, step: number): void {
    const castle = s.kind === SITE_CASTLE;
    const u = 3 * dpr;
    if (s.kind === SITE_VILLAGE || s.kind === SITE_CITY) {
      // A cluster of little houses (more and bigger for the city).
      const city = s.kind === SITE_CITY;
      const k = city ? 1.5 : 1;
      const houses: Array<[number, number]> = city ? [[-2.2, 0.6], [0, -0.8], [2.2, 0.6], [-1.1, 2.2], [1.1, 2.2]] : [[-1.2, 0.3], [1.2, 0.3]];
      g.lineWidth = 1.2 * dpr;
      g.strokeStyle = '#2b1d33';
      for (const [hx, hy] of houses) {
        const X0 = X + hx * u * k, Y0 = Y + hy * u * k;
        g.fillStyle = '#f2ead8';
        g.fillRect(X0 - u * 0.9, Y0 - u * 0.6, u * 1.8, u * 1.4);
        g.strokeRect(X0 - u * 0.9, Y0 - u * 0.6, u * 1.8, u * 1.4);
        g.fillStyle = '#c85a4a';
        g.beginPath();
        g.moveTo(X0 - u * 1.2, Y0 - u * 0.5); g.lineTo(X0, Y0 - u * 1.5); g.lineTo(X0 + u * 1.2, Y0 - u * 0.5);
        g.closePath(); g.fill(); g.stroke();
      }
      if (step <= 8 || city) {
        const prev = g.font;
        if (city) g.font = `bold ${Math.round(15 * dpr)}px "Cascadia Mono", Consolas, monospace`;
        const ly = Y - (city ? 6.5 : 4.5) * u;
        g.fillStyle = '#2b1d33';
        g.fillText(s.name, X + dpr, ly + dpr);
        g.fillStyle = city ? '#ffe7a8' : '#fff6e2';
        g.fillText(s.name, X, ly);
        g.font = prev;
      }
      return;
    }
    if (s.kind === SITE_ORC) {
      // Hide tents round a fire; the orda gets three and a war banner.
      const cap = !!s.capital, k = cap ? 1.4 : 1;
      const tents: Array<[number, number]> = cap ? [[-2, 0.8], [0, -0.6], [2, 0.8]] : [[-1, 0.4], [1, 0.4]];
      g.lineWidth = 1.2 * dpr;
      g.strokeStyle = '#2b1d33';
      for (const [hx, hy] of tents) {
        const X0 = X + hx * u * k, Y0 = Y + hy * u * k;
        g.fillStyle = '#a8865c';
        g.beginPath();
        g.moveTo(X0 - u * 1.1, Y0 + u * 0.8); g.lineTo(X0, Y0 - u * 1.2); g.lineTo(X0 + u * 1.1, Y0 + u * 0.8);
        g.closePath(); g.fill(); g.stroke();
      }
      if (cap) {
        g.fillStyle = '#2b1d33';
        g.fillRect(X - 0.15 * u, Y - 5.6 * u, 0.3 * u, 3.4 * u);
        g.fillStyle = '#8a2420';
        g.fillRect(X + 0.15 * u, Y - 5.6 * u, 1.8 * u, 1.3 * u);
        g.strokeRect(X + 0.15 * u, Y - 5.6 * u, 1.8 * u, 1.3 * u);
      }
      if (step <= 8 || cap) {
        const prev = g.font;
        if (cap) g.font = `bold ${Math.round(14 * dpr)}px "Cascadia Mono", Consolas, monospace`;
        const ly = Y - (cap ? 7 : 4) * u;
        g.fillStyle = '#2b1d33';
        g.fillText(s.name, X + dpr, ly + dpr);
        g.fillStyle = cap ? '#ffb39a' : '#f2d8c0';
        g.fillText(s.name, X, ly);
        g.font = prev;
      }
      return;
    }
    // Ruins are dusky purple; held castles pale stone with the house flag.
    g.fillStyle = castle ? (s.held ? '#c8c2d2' : '#5b4a72') : '#f6e7c8';
    g.strokeStyle = '#2b1d33';
    g.lineWidth = 1.5 * dpr;
    if (castle) {
      // little tower glyph with battlements
      g.fillRect(X - 2 * u, Y - 2 * u, 4 * u, 4 * u);
      g.fillRect(X - 2 * u, Y - 3 * u, u, u);
      g.fillRect(X - 0.5 * u, Y - 3 * u, u, u);
      g.fillRect(X + u, Y - 3 * u, u, u);
      g.strokeRect(X - 2 * u, Y - 2 * u, 4 * u, 4 * u);
      g.fillStyle = '#ffd98a';
      g.fillRect(X - 0.5 * u, Y - 0.5 * u, u, u * 1.5);
      if (s.held) {
        g.fillStyle = '#2b1d33';
        g.fillRect(X - 0.15 * u, Y - 5.2 * u, 0.3 * u, 2.2 * u);
        g.fillStyle = castleHouse(s, this.terrain.seed).color;
        g.fillRect(X + 0.15 * u, Y - 5.2 * u, 1.8 * u, 1.1 * u);
        g.strokeRect(X + 0.15 * u, Y - 5.2 * u, 1.8 * u, 1.1 * u);
      }
    } else {
      g.beginPath();
      g.arc(X, Y, 1.5 * u, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (step <= 8 || castle) {
      g.fillStyle = '#2b1d33';
      const ly = Y - (s.held ? 6 : 4) * u;
      g.fillText(s.name, X + 1 * dpr, ly + 1 * dpr);
      g.fillStyle = castle ? '#e9d8ff' : '#fff6e2';
      g.fillText(s.name, X, ly);
    }
  }
}
