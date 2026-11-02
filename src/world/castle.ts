// Procedural ruined castle. Built once per site into a local voxel buffer,
// then stamped into every chunk region it overlaps.

import { hash01 } from '../engine/noise';
import { B } from './blocks';
import type { Site } from './structures';

/** Buffer codes besides block ids. */
export const C_KEEP = 0; // leave terrain untouched
export const C_AIR = 255; // carve to air
export const C_FILL = 254; // foundation: stone only where terrain is missing
export const C_SURFACE = 253; // levelled ground: the plan's surface block

export interface CastlePlan {
  /** World coordinates of buffer cell (0,0,0). */
  ox: number;
  oy: number;
  oz: number;
  w: number;
  h: number;
  d: number;
  cells: Uint8Array;
  /** Footprint half-size (walls), used for masks. */
  half: number;
  cx: number;
  cz: number;
  floorY: number;
  /** Block used for C_SURFACE cells (biome topsoil). */
  surface?: number;
  /** Keep trees and plants off every column the plan touches (villages). */
  clearMask?: boolean;
}

const FOUNDATION = 12;
const MAX_UP = 44;

/**
 * gate: 0 = +X, 1 = -X, 2 = +Z, 3 = -Z side of the curtain wall.
 */
export function buildCastle(site: Site, seed: number, gate: number): CastlePlan {
  const r = (k: number) => hash01(site.gx * 97 + k, 811 + k, site.gz * 61 - k, seed);
  const half = 13 + Math.floor(r(1) * 5); // wall ring half-size
  const reach = half + 6;
  const w = reach * 2 + 1, d = w, h = FOUNDATION + MAX_UP;
  const cells = new Uint8Array(w * h * d);
  const floorY = Math.floor(site.h);
  const ox = site.x - reach, oz = site.z - reach, oy = floorY - FOUNDATION;
  const at = (x: number, y: number, z: number) => (y * d + z) * w + x;
  const L = (wx: number) => wx + reach; // site-relative -> local
  const set = (x: number, y: number, z: number, b: number) => {
    const lx = L(x), lz = L(z), ly = y + FOUNDATION;
    if (lx < 0 || lz < 0 || lx >= w || lz >= d || ly < 0 || ly >= h) return;
    cells[at(lx, ly, lz)] = b;
  };
  const get = (x: number, y: number, z: number) => {
    const lx = L(x), lz = L(z), ly = y + FOUNDATION;
    if (lx < 0 || lz < 0 || lx >= w || lz >= d || ly < 0 || ly >= h) return C_KEEP;
    return cells[at(lx, ly, lz)];
  };
  const noise = (x: number, y: number, z: number, k: number) => hash01(site.x + x, y * 7 + k, site.z + z, seed);

  const wallBlock = (x: number, y: number, z: number): number => {
    const n = noise(x, y, z, 1);
    if (y < 2) return n < 0.4 ? B.MOSSY_BRICKS : n < 0.7 ? B.COBBLE : B.STONE_BRICKS;
    return n < 0.55 ? B.STONE_BRICKS : n < 0.75 ? B.MOSSY_BRICKS : n < 0.92 ? B.CRACKED_BRICKS : B.COBBLE;
  };

  // Ruin: big collapsed sections (low-frequency) plus random missing stones near the top.
  const ruinSeed = r(2) * 100;
  const collapsed = (x: number, z: number): number => {
    const a = Math.sin((x + ruinSeed) * 0.21) * Math.cos((z - ruinSeed) * 0.17) + Math.sin((x - z) * 0.11 + ruinSeed);
    return a > 1.05 ? (a - 1.05) * 9 : 0; // how many blocks the wall top drops here
  };

  // --- ground: clear the footprint, lay a foundation and a courtyard floor
  for (let z = -reach; z <= reach; z++) {
    for (let x = -reach; x <= reach; x++) {
      const inside = Math.max(Math.abs(x), Math.abs(z)) <= half + 4;
      if (!inside) continue;
      for (let y = -FOUNDATION; y < 0; y++) set(x, y, z, C_FILL);
      const n = noise(x, 0, z, 2);
      set(x, 0, z, n < 0.35 ? B.COBBLE : n < 0.55 ? B.MOSS_STONE : n < 0.7 ? B.GRAVEL : n < 0.85 ? B.PATH : B.STONE_BRICKS);
      for (let y = 1; y < MAX_UP; y++) set(x, y, z, C_AIR);
    }
  }

  // --- curtain wall (2 thick) with crenellations
  const wallH = 7 + Math.floor(r(3) * 3);
  for (let z = -half; z <= half; z++) {
    for (let x = -half; x <= half; x++) {
      const ring = Math.max(Math.abs(x), Math.abs(z));
      if (ring < half - 1) continue;
      const top = wallH - collapsed(x, z);
      for (let y = 1; y <= top; y++) set(x, y, z, wallBlock(x, y, z));
      // merlons on the outer ring
      if (ring === half && collapsed(x, z) === 0 && (x + z) % 2 === 0) set(x, wallH + 1, z, wallBlock(x, wallH + 1, z));
      // rubble at the foot of collapsed parts
      if (collapsed(x, z) > 2 && noise(x, 0, z, 3) < 0.5) {
        const out = ring === half ? 1 : -1;
        const rx = x + Math.sign(x) * (Math.abs(x) === ring ? out : 0);
        const rz = z + Math.sign(z) * (Math.abs(z) === ring ? out : 0);
        set(rx, 1, rz, noise(x, 1, z, 4) < 0.5 ? B.COBBLE : B.GRAVEL);
      }
    }
  }

  // --- towers (hollow cylinders with floors, slit windows, roofs or battlements)
  const tower = (tx: number, tz: number, radius: number, height: number, roof: boolean, lit: number) => {
    const rr = radius + 0.5;
    for (let z = -Math.ceil(rr); z <= Math.ceil(rr); z++) {
      for (let x = -Math.ceil(rr); x <= Math.ceil(rr); x++) {
        const dist = Math.hypot(x, z);
        if (dist > rr) continue;
        const shell = dist > rr - 1.3;
        for (let y = 1; y <= height; y++) {
          const wx = tx + x, wz = tz + z;
          if (shell) {
            const window = y % 5 === 3 && (Math.abs(x) <= 0 || Math.abs(z) <= 0);
            const glow = window && noise(wx, y, wz, 5) < lit;
            set(wx, y, wz, window ? (glow ? B.WINDOW_LIT : B.WINDOW_DARK) : wallBlock(wx, y, wz));
          } else {
            set(wx, y, wz, y % 5 === 0 ? B.DARK_PLANKS : C_AIR);
          }
        }
        if (roof) {
          // Stepped cone of slate with a spire.
          for (let k = 0; k <= Math.ceil(rr) + 1; k++) {
            if (dist <= rr + 0.6 - k * 0.85) set(tx + x, height + 1 + k * 1, tz + z, B.SLATE);
          }
        } else if (shell && (x + z) % 2 === 0) {
          set(tx + x, height + 1, tz + z, wallBlock(tx + x, height + 1, tz + z));
        }
      }
    }
    if (roof) for (let k = 0; k < 3; k++) set(tx, height + Math.ceil(rr) + 3 + k, tz, k === 2 ? B.LANTERN : B.SLATE);
  };

  const cornerH = 12 + Math.floor(r(4) * 4);
  const corners: Array<[number, number]> = [[half, half], [-half, half], [half, -half], [-half, -half]];
  corners.forEach(([x, z], i) => {
    // One corner tower is usually a broken stump.
    const broken = i === Math.floor(r(5) * 4) && r(6) < 0.7;
    tower(x, z, 3, broken ? 5 + Math.floor(r(7) * 4) : cornerH, !broken && r(8 + i) < 0.6, 0.25);
  });

  // --- gatehouse: opening through the wall, flanking towers, lanterns
  const gx = gate === 0 ? 1 : gate === 1 ? -1 : 0;
  const gz = gate === 2 ? 1 : gate === 3 ? -1 : 0;
  const px = -gz, pz = gx; // along the wall
  for (const side of [-1, 1]) tower(gx * half + px * side * 4, gz * half + pz * side * 4, 2, wallH + 3, false, 0.6);
  for (let s = -1; s <= 1; s++) {
    for (let depth = -2; depth <= 1; depth++) {
      for (let y = 1; y <= 4; y++) set(gx * (half + depth) + px * s, y, gz * (half + depth) + pz * s, C_AIR);
    }
  }
  for (const side of [-2, 2]) set(gx * (half + 1) + px * side, 4, gz * (half + 1) + pz * side, B.LANTERN);
  // A cobbled approach leading out of the gate.
  for (let k = 1; k <= 5; k++) for (let s = -1; s <= 1; s++) set(gx * (half + k) + px * s, 0, gz * (half + k) + pz * s, B.COBBLE);

  // --- keep: tall hollow block with floors, lit windows and a slate roof
  const kw = 3 + Math.floor(r(9) * 2), kd = 3 + Math.floor(r(10) * 2);
  const kx = -gx * 3, kz = -gz * 3; // set back from the gate
  const keepH = 18 + Math.floor(r(11) * 7);
  for (let z = -kd; z <= kd; z++) {
    for (let x = -kw; x <= kw; x++) {
      const edge = Math.abs(x) === kw || Math.abs(z) === kd;
      for (let y = 1; y <= keepH; y++) {
        const wx = kx + x, wz = kz + z;
        if (!edge) { set(wx, y, wz, y % 6 === 0 ? B.DARK_PLANKS : C_AIR); continue; }
        const corner = Math.abs(x) === kw && Math.abs(z) === kd;
        const window = !corner && y % 6 === 3 && (Math.abs(x) % 2 === 1 || Math.abs(z) % 2 === 1) && y > 2;
        set(wx, y, wz, window ? (noise(wx, y, wz, 6) < 0.45 ? B.WINDOW_LIT : B.WINDOW_DARK) : wallBlock(wx, y, wz));
      }
      // stepped slate roof
      const ring = Math.max(Math.abs(x) / kw, Math.abs(z) / kd);
      const steps = Math.min(kw, kd) + 1;
      const level = Math.round((1 - ring) * steps);
      for (let k = 0; k <= level; k++) set(kx + x, keepH + 1 + k, kz + z, B.SLATE);
    }
  }
  const spireBase = keepH + Math.min(kw, kd) + 3;
  for (let k = 0; k < 4; k++) set(kx, spireBase + k, kz, k === 3 ? B.LANTERN : B.SLATE);
  // keep door facing the gate
  for (let y = 1; y <= 3; y++) set(kx + gx * kw, y, kz + gz * kd, C_AIR);

  // --- ivy hanging down outer faces of walls and towers
  for (let z = -reach; z <= reach; z++) {
    for (let x = -reach; x <= reach; x++) {
      if (noise(x, 9, z, 7) > 0.12) continue;
      // find a wall top next to this air column
      for (let y = MAX_UP - 2; y > 2; y--) {
        if (get(x, y, z) !== C_AIR && get(x, y, z) !== C_KEEP) break;
        const nb = [get(x + 1, y, z), get(x - 1, y, z), get(x, y, z + 1), get(x, y, z - 1)];
        if (nb.some((b) => b === B.STONE_BRICKS || b === B.MOSSY_BRICKS || b === B.CRACKED_BRICKS)) {
          const len = 2 + Math.floor(noise(x, y, z, 8) * 6);
          for (let k = 0; k < len && y - k > 0; k++) {
            const cur = get(x, y - k, z);
            if (cur === C_AIR || cur === C_KEEP) set(x, y - k, z, B.GLOOM_LEAVES);
          }
          break;
        }
      }
    }
  }

  return { ox, oy, oz, w, h, d, cells, half: half + 4, cx: site.x, cz: site.z, floorY };
}
