// Web Worker: renders map tiles (biome colours + hillshade) from the terrain functions.

import { Terrain } from './terrain';
import { SEA, HEIGHT } from './blocks';

export type MapRequest =
  | { type: 'init'; seed: number }
  | { type: 'tile'; key: string; x0: number; z0: number; step: number; size: number };

export interface MapTile {
  type: 'tile';
  key: string;
  size: number;
  rgba: Uint8ClampedArray;
}

// Pastel biome palette, indexed by BIOME id.
const COLORS: Array<[number, number, number]> = [
  [127, 166, 217], // ocean
  [188, 212, 238], // frozen ocean
  [243, 226, 179], // beach
  [184, 180, 176], // stony shore
  [138, 180, 230], // river
  [169, 214, 155], // plains
  [127, 184, 134], // forest
  [166, 209, 160], // birch forest
  [111, 159, 138], // taiga
  [223, 231, 234], // tundra
  [242, 219, 165], // desert
  [227, 163, 138], // badlands
  [154, 134, 176], // gloom forest
  [179, 174, 176], // mountains
  [244, 246, 250], // snowy peaks
  [96, 76, 80], // ashlands
  [40, 82, 84], // eldritch sea
  [74, 70, 82], // black beach
];

interface Scope {
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as Scope;
let terrain: Terrain | null = null;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

scope.onmessage = (e) => {
  const m = e.data as Partial<MapRequest> | null;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'init' && isNum(m.seed)) { terrain = new Terrain(m.seed >>> 0); return; }
  if (m.type !== 'tile' || !terrain || typeof m.key !== 'string' || !isNum(m.x0) || !isNum(m.z0) || !isNum(m.step) || !isNum(m.size)) return;
  const size = Math.min(256, Math.max(8, m.size | 0));
  const step = Math.max(1, m.step);
  // Heights with a 1-pixel border on the top/left for hillshading.
  const H = new Float32Array((size + 1) * (size + 1));
  const biome = new Uint8Array(size * size);
  for (let j = 0; j <= size; j++) {
    for (let i = 0; i <= size; i++) {
      const s = terrain.sample(m.x0 + (i - 1) * step, m.z0 + (j - 1) * step);
      H[j * (size + 1) + i] = s.h;
      if (i > 0 && j > 0) biome[(j - 1) * size + (i - 1)] = s.biome;
    }
  }
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const h = H[(j + 1) * (size + 1) + i + 1];
      const hl = H[(j + 1) * (size + 1) + i];
      const hu = H[j * (size + 1) + i + 1];
      const [r, g, b] = COLORS[biome[j * size + i]];
      let k: number;
      if (h < SEA) {
        k = 0.7 + 0.3 * Math.max(0, 1 - (SEA - h) / 24); // deeper = darker
      } else {
        const shade = ((h - hl) + (h - hu)) * (0.9 / step + 0.08);
        k = (0.92 + ((h - SEA) / (HEIGHT - SEA)) * 0.25) * (1 + Math.max(-0.35, Math.min(0.35, shade)));
      }
      const p = (j * size + i) * 4;
      rgba[p] = r * k; rgba[p + 1] = g * k; rgba[p + 2] = b * k; rgba[p + 3] = 255;
    }
  }
  const tile: MapTile = { type: 'tile', key: m.key, size, rgba };
  scope.postMessage(tile, [rgba.buffer]);
};
