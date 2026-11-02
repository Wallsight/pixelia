// Signpost meshes: a wooden post with pointed boards carrying pixel text.

import * as THREE from 'three';
import { createPropMaterial, type EnvUniforms } from './materials';
import { LAYER_PROP_CASTER } from './shadows';
import type { SignRecord } from '../world/stamp';

const PX_PER_BLOCK = 64;
const BOARD_H = 0.34;
const WOOD = '#b08a5a';
const WOOD_DARK = '#6e4f31';

function boardTexture(text: string, arrowRight: boolean, arrow = true): { tex: THREE.CanvasTexture; width: number } {
  const font = 'bold 14px "Cascadia Mono", Consolas, monospace';
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const textW = Math.ceil(measure.measureText(text).width);
  const w = textW + 34, h = Math.round(BOARD_H * PX_PER_BLOCK);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // Planks with grain lines and a dark rim.
  g.fillStyle = WOOD;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#a07c4f';
  for (let y = 4; y < h; y += 7) g.fillRect(0, y, w, 1);
  g.fillStyle = WOOD_DARK;
  g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
  // Arrow
  if (arrow) {
  const ax = arrowRight ? w - 14 : 14, dir = arrowRight ? 1 : -1;
  g.fillStyle = '#3b2a1c';
  for (let i = 0; i < 6; i++) g.fillRect(ax - dir * i - (dir < 0 ? 1 : 0), h / 2 - 6 + i, 1, 12 - i * 2);
  }
  // Text
  g.font = font;
  g.textBaseline = 'middle';
  g.fillStyle = '#2e2118';
  g.fillText(text, !arrow ? 17 : arrowRight ? 8 : 24, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.NoColorSpace; // the shader linearises colours itself
  return { tex, width: w / PX_PER_BLOCK };
}

export class SignFactory {
  private postGeo = new THREE.BoxGeometry(0.16, 2.3, 0.16);
  private postMat: THREE.ShaderMaterial;
  private edgeMat: THREE.ShaderMaterial;
  private stoneMat: THREE.ShaderMaterial;

  constructor(private env: EnvUniforms, private shadows: boolean) {
    this.postMat = createPropMaterial(env, { color: WOOD_DARK, shadows });
    this.edgeMat = createPropMaterial(env, { color: WOOD, shadows });
    this.stoneMat = createPropMaterial(env, { color: '#8a8991', shadows });
  }

  build(rec: SignRecord): THREE.Group {
    if (rec.style === 'tomb') return this.buildTomb(rec);
    if (rec.style === 'plaque') return this.buildPlaque(rec);
    const group = new THREE.Group();
    group.position.set(rec.x, rec.y, rec.z);
    const post = new THREE.Mesh(this.postGeo, this.postMat);
    post.position.y = 1.15;
    group.add(post);

    rec.boards.slice(0, 4).forEach((b, i) => {
      const front = boardTexture(b.text, true);
      const back = boardTexture(b.text, false);
      const width = front.width;
      const geo = new THREE.BoxGeometry(width, BOARD_H, 0.06);
      // Box material order: +x, -x, +y, -y, +z (front), -z (back).
      const frontMat = createPropMaterial(this.env, { map: front.tex, shadows: this.shadows });
      const backMat = createPropMaterial(this.env, { map: back.tex, shadows: this.shadows });
      const board = new THREE.Mesh(geo, [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, frontMat, backMat]);
      const pivot = new THREE.Group();
      pivot.rotation.y = Math.atan2(-b.dz, b.dx);
      pivot.position.y = 2.0 - i * 0.42;
      board.position.x = width / 2 - 0.05; // the board sticks out towards its destination
      pivot.add(board);
      group.add(pivot);
    });

    group.traverse((o) => o.layers.enable(LAYER_PROP_CASTER));
    return group;
  }

  /** Gravestone: rounded slab with engraved, word-wrapped text on the front. */
  private buildTomb(rec: SignRecord): THREE.Group {
    const b = rec.boards[0];
    const W = 56, H = 72;
    const front = document.createElement('canvas');
    front.width = W; front.height = H;
    const g = front.getContext('2d')!;
    const shape = () => {
      g.beginPath();
      g.moveTo(0, H); g.lineTo(0, 18); g.arc(W / 2, 18, W / 2, Math.PI, 0); g.lineTo(W, H); g.closePath();
    };
    shape();
    g.fillStyle = '#8d8c94';
    g.fill();
    g.fillStyle = '#7a7981';
    for (let i = 0; i < 40; i++) g.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 2, 1);
    g.fillStyle = '#6c7a52'; // moss at the foot
    g.fillRect(0, H - 6, W, 6);
    g.font = 'bold 8px "Cascadia Mono", Consolas, monospace';
    g.textAlign = 'center';
    g.fillStyle = '#3a3940';
    const words = b.text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (g.measureText(next).width > W - 8 && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    lines.slice(0, 7).forEach((l, i) => g.fillText(l, W / 2, 20 + i * 8));
    // back: plain stone with the same silhouette
    const back = document.createElement('canvas');
    back.width = W; back.height = H;
    const gb = back.getContext('2d')!;
    gb.beginPath(); gb.moveTo(0, H); gb.lineTo(0, 18); gb.arc(W / 2, 18, W / 2, Math.PI, 0); gb.lineTo(W, H); gb.closePath();
    gb.fillStyle = '#85848c'; gb.fill();

    const tex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.magFilter = THREE.NearestFilter;
      t.colorSpace = THREE.NoColorSpace;
      return t;
    };
    const fMat = createPropMaterial(this.env, { map: tex(front), shadows: this.shadows });
    const bMat = createPropMaterial(this.env, { map: tex(back), shadows: this.shadows });
    const geo = new THREE.PlaneGeometry(0.78, 1.0);
    const group = new THREE.Group();
    group.position.set(rec.x, rec.y, rec.z);
    group.rotation.y = Math.atan2(b.dx, b.dz);
    const f = new THREE.Mesh(geo, fMat);
    f.position.set(0, 0.5, 0.06);
    const k = new THREE.Mesh(geo.clone(), bMat);
    k.position.set(0, 0.5, -0.06);
    k.rotation.y = Math.PI;
    // a thin core so the stone has thickness from the side
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.7, 0.1), this.stoneMat);
    core.position.y = 0.35;
    group.add(f, k, core);
    group.traverse((o) => o.layers.enable(LAYER_PROP_CASTER));
    return group;
  }

  /** Plank fixed to a wall or structure, text on the front only. */
  private buildPlaque(rec: SignRecord): THREE.Group {
    const b = rec.boards[0];
    const front = boardTexture(b.text, true, false);
    const geo = new THREE.BoxGeometry(front.width, BOARD_H, 0.06);
    const frontMat = createPropMaterial(this.env, { map: front.tex, shadows: this.shadows });
    const board = new THREE.Mesh(geo, [this.edgeMat, this.edgeMat, this.edgeMat, this.edgeMat, frontMat, this.edgeMat]);
    const group = new THREE.Group();
    group.position.set(rec.x, rec.y, rec.z);
    group.rotation.y = Math.atan2(b.dx, b.dz);
    group.add(board);
    return group;
  }

  dispose(group: THREE.Group): void {
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.geometry === this.postGeo) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m === this.edgeMat || m === this.postMat || m === this.stoneMat) continue;
        (m as THREE.ShaderMaterial).uniforms.uMap?.value?.dispose();
        m.dispose();
      }
    });
  }
}
