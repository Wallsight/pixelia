// Tree shapes. Placement must be order-independent between chunks:
// logs may replace air/leaves/plants, leaves only ever fill air.

import { hash01 } from '../engine/noise';
import { B, HEIGHT, KIND, KIND_AIR, KIND_LEAVES, KIND_PLANT } from './blocks';
import { BIOME, RW } from './biomes';

export const TREE_CACTUS = 7;
export const TREE_BOULDER = 9;
const OAK = 0, BIG_OAK = 1, BIRCH = 2, SPRUCE = 3, TALL_SPRUCE = 4, GLOOM = 5, DEAD = 6, CACTUS = 7, BUSH = 8, BOULDER = 9, CHARRED = 10;

type Idx = (x: number, y: number, z: number) => number;

/** Returns a tree type for this column, or -1 for none. */
export function treeChoice(biome: number, wx: number, wz: number, seed: number): number {
  const r = hash01(wx, 101, wz, seed);
  const t = hash01(wx, 202, wz, seed);
  switch (biome) {
    case BIOME.PLAINS:
      if (r < 0.002) return OAK;
      if (r < 0.0045) return BUSH;
      if (r < 0.006) return BOULDER;
      return -1;
    case BIOME.FOREST:
      if (r >= 0.016) return r < 0.0185 ? BOULDER : -1;
      return t < 0.08 ? BIG_OAK : t < 0.25 ? BIRCH : t < 0.32 ? BUSH : OAK;
    case BIOME.BIRCH_FOREST:
      if (r >= 0.016) return r < 0.018 ? BOULDER : -1;
      return t < 0.8 ? BIRCH : OAK;
    case BIOME.TAIGA:
      if (r >= 0.015) return r < 0.019 ? BOULDER : -1;
      return t < 0.3 ? TALL_SPRUCE : SPRUCE;
    case BIOME.TUNDRA:
      return r < 0.0025 ? SPRUCE : r < 0.005 ? BOULDER : -1;
    case BIOME.MOUNTAINS:
      return r < 0.006 ? SPRUCE : r < 0.012 ? BOULDER : -1;
    case BIOME.GLOOM:
      if (r >= 0.015) return r < 0.02 ? BOULDER : -1;
      return t < 0.22 ? DEAD : GLOOM;
    case BIOME.DESERT:
      return r < 0.004 ? CACTUS : -1;
    case BIOME.BADLANDS:
      return r < 0.002 ? CACTUS : -1;
    case BIOME.ASHLANDS:
      return r < 0.005 ? CHARRED : r < 0.008 ? BOULDER : -1;
    default:
      return -1;
  }
}

export function placeTree(
  type: number, blocks: Uint8Array, lx: number, y: number, lz: number,
  wx: number, wz: number, seed: number, idx: Idx,
): void {
  const rnd = (k: number) => hash01(wx * 31 + k, 977 + k, wz * 17 - k, seed);

  const inBounds = (x: number, yy: number, z: number) => x >= 0 && x < RW && z >= 0 && z < RW && yy > 0 && yy < HEIGHT;
  const log = (x: number, yy: number, z: number, b: number) => {
    if (!inBounds(x, yy, z)) return;
    const i = idx(x, yy, z);
    const k = KIND[blocks[i]];
    if (k === KIND_AIR || k === KIND_LEAVES || k === KIND_PLANT) blocks[i] = b;
  };
  const leaf = (x: number, yy: number, z: number, b: number) => {
    if (!inBounds(x, yy, z)) return;
    const i = idx(x, yy, z);
    if (blocks[i] === B.AIR) blocks[i] = b;
  };
  /** Disc of leaves with optionally ragged corners. */
  const disc = (cy: number, r: number, b: number, ragged: number, salt: number) => {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const corner = Math.abs(dx) === r && Math.abs(dz) === r;
        if (corner && hash01(wx + dx, cy * 7 + salt, wz + dz, seed) < ragged) continue;
        if (dx * dx + dz * dz > r * r + r) continue;
        leaf(lx + dx, cy, lz + dz, b);
      }
    }
  };

  switch (type) {
    case OAK:
    case BIRCH: {
      const birch = type === BIRCH;
      const h = (birch ? 5 : 4) + Math.floor(rnd(1) * 3);
      const lb = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
      const top = y + h;
      disc(top - 2, 2, lb, 0.7, 1);
      disc(top - 1, 2, lb, 0.9, 2);
      disc(top, 1, lb, 0.5, 3);
      disc(top + 1, 1, lb, 1.0, 4);
      if (!birch) leaf(lx, top + 1, lz, lb);
      for (let i = 0; i < h; i++) log(lx, y + i, lz, birch ? B.BIRCH_LOG : B.OAK_LOG);
      break;
    }
    case BIG_OAK: {
      const h = 7 + Math.floor(rnd(1) * 3);
      const cy = y + h - 1;
      const r = 3.3 + rnd(2) * 0.8;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          for (let dx = -4; dx <= 4; dx++) {
            const d = (dx * dx + dz * dz) / (r * r) + (dy * dy) / ((r - 1) * (r - 1));
            const jitter = hash01(wx + dx, cy + dy, wz + dz, seed) * 0.35;
            if (d < 1 - jitter * 0.5) leaf(lx + dx, cy + dy, lz + dz, B.OAK_LEAVES);
          }
        }
      }
      for (let i = 0; i < h; i++) log(lx, y + i, lz, B.OAK_LOG);
      // Two branches reaching into the crown.
      for (let b = 0; b < 2; b++) {
        const ang = rnd(10 + b) * Math.PI * 2;
        const ox = Math.round(Math.cos(ang) * 2), oz = Math.round(Math.sin(ang) * 2);
        const by = y + h - 3 - b;
        log(lx + Math.sign(ox), by, lz + Math.sign(oz), B.OAK_LOG);
        log(lx + ox, by + 1, lz + oz, B.OAK_LOG);
      }
      break;
    }
    case SPRUCE:
    case TALL_SPRUCE: {
      const tall = type === TALL_SPRUCE;
      const h = (tall ? 9 : 6) + Math.floor(rnd(1) * (tall ? 4 : 3));
      const top = y + h;
      const start = y + (tall ? 3 : 2);
      let r = 1;
      for (let cy = top; cy >= start; cy--) {
        const fromTop = top - cy;
        if (fromTop === 0) { leaf(lx, cy + 1, lz, B.SPRUCE_LEAVES); r = 1; }
        else r = fromTop % 2 === 1 ? Math.min(tall ? 3 : 2, 1 + (fromTop >> 1)) : Math.max(1, r - 1);
        disc(cy, r, B.SPRUCE_LEAVES, 0.8, 5);
      }
      leaf(lx, top, lz, B.SPRUCE_LEAVES);
      for (let i = 0; i < h; i++) log(lx, y + i, lz, B.SPRUCE_LOG);
      break;
    }
    case GLOOM: {
      const h = 5 + Math.floor(rnd(1) * 4);
      // Slightly crooked trunk.
      const kx = rnd(2) < 0.5 ? 0 : rnd(3) < 0.5 ? 1 : -1;
      const kz = kx !== 0 ? 0 : rnd(4) < 0.5 ? 1 : -1;
      const bend = y + 2 + Math.floor(rnd(5) * 2);
      let tx = lx, tz = lz;
      for (let i = 0; i < h; i++) {
        if (y + i === bend) { tx += kx; tz += kz; }
        log(tx, y + i, tz, B.GLOOM_LOG);
      }
      const top = y + h;
      disc(top - 1, 3, B.GLOOM_LEAVES, 0.9, 6);
      disc(top, 2, B.GLOOM_LEAVES, 0.6, 7);
      leaf(tx, top + 1, tz, B.GLOOM_LEAVES);
      // Hanging strands from the rim of the crown.
      for (let s = 0; s < 6; s++) {
        const a = rnd(20 + s) * Math.PI * 2;
        const sx = lx + Math.round(Math.cos(a) * 3), sz = lz + Math.round(Math.sin(a) * 3);
        const len = 1 + Math.floor(rnd(30 + s) * 3);
        for (let d = 1; d <= len; d++) leaf(sx, top - 1 - d, sz, B.GLOOM_LEAVES);
      }
      break;
    }
    case DEAD:
    case CHARRED: {
      const wood = type === CHARRED ? B.CHARRED_LOG : B.GLOOM_LOG;
      const h = 4 + Math.floor(rnd(1) * 4);
      for (let i = 0; i < h; i++) log(lx, y + i, lz, wood);
      const branches = 2 + Math.floor(rnd(2) * 2);
      for (let b = 0; b < branches; b++) {
        const dir = Math.floor(rnd(3 + b) * 4);
        const dx = [1, -1, 0, 0][dir], dz = [0, 0, 1, -1][dir];
        const by = y + h - 1 - Math.floor(rnd(9 + b) * 3);
        log(lx + dx, by, lz + dz, wood);
        log(lx + dx * 2, by + 1, lz + dz * 2, wood);
      }
      break;
    }
    case CACTUS: {
      const h = 2 + Math.floor(rnd(1) * 3);
      for (let i = 0; i < h; i++) log(lx, y + i, lz, B.CACTUS);
      break;
    }
    case BOULDER: {
      // Half-buried rock: an ellipsoid of stone with mossy / cobbled patches.
      const rx = 1.2 + rnd(1) * 1.3, ry = 0.9 + rnd(2) * 1.1, rz = 1.2 + rnd(3) * 1.3;
      const cy = y - 1 + Math.floor(rnd(4) * 2);
      for (let dy = -2; dy <= 3; dy++) {
        for (let dz = -3; dz <= 3; dz++) {
          for (let dx = -3; dx <= 3; dx++) {
            const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);
            if (d > 1 - hash01(wx + dx, cy + dy, wz + dz, seed) * 0.25) continue;
            const m = hash01(wx + dx, cy + dy + 50, wz + dz, seed);
            log(lx + dx, cy + dy, lz + dz, m < 0.25 ? B.MOSS_STONE : m < 0.4 ? B.COBBLE : B.STONE);
          }
        }
      }
      break;
    }
    case BUSH: {
      disc(y, 1, B.OAK_LEAVES, 0.8, 8);
      leaf(lx, y + 1, lz, B.OAK_LEAVES);
      log(lx, y, lz, B.OAK_LOG);
      break;
    }
  }
}
