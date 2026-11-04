// Procedural castles. Most stand in ruins (always in the gloom); the rest are
// held by a noble house: intact walls with a wall walk, banners in the house
// colour, a parade ground, training dummies, archery butts, tents and braziers.
// Built once per site into a local voxel buffer, then stamped into every chunk
// region it overlaps. castleLayout() also tells the garrison where to stand.

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

/** The noble house holding a castle. */
export interface CastleHouse {
  name: string;
  /** Banner block. */
  banner: number;
  /** Tabard colour of its soldiers. */
  color: string;
}

const HOUSE_ROOTS = ['Demir', 'Kartal', 'Arslan', 'Doğan', 'Bozkurt', 'Şahin', 'Yıldırım', 'Akın', 'Turna', 'Tunç', 'Alp', 'Börü', 'Ilgaz', 'Karaca'];
const HOUSE_COLOURS: Array<[number, string]> = [
  [B.BANNER_RED, '#b8323a'], [B.BANNER_BLUE, '#2f5aa8'], [B.BANNER_GREEN, '#2f7a44'], [B.BANNER_BLACK, '#3a3640'], [B.BANNER_PURPLE, '#6a3a8a'],
];

export function castleHouse(site: Site, seed: number): CastleHouse {
  // A house may hold several castles; it always flies the same colour.
  const k = Math.floor(hash01(site.gx, 820, site.gz, seed) * HOUSE_ROOTS.length);
  const root = HOUSE_ROOTS[k];
  const [banner, color] = HOUSE_COLOURS[(k + Math.floor(hash01(0, 821, 0, seed) * HOUSE_COLOURS.length)) % HOUSE_COLOURS.length];
  return { name: `${root}oğulları`, banner, color };
}

/** A place in castle-local coordinates: u towards the gate, v along the gate wall. */
export interface Spot { u: number; v: number; y: number; /** Facing, local (du, dv). */ fu: number; fv: number }

export interface CastleLayout {
  held: boolean;
  half: number;
  /** Inner courtyard extent: |u|, |v| <= inner. */
  inner: number;
  wallH: number;
  gate: number;
  /** Gate direction and the direction along the gate wall (site-relative XZ). */
  gx: number; gz: number; px: number; pz: number;
  cx: number; cz: number;
  floorY: number;
  kw: number; kd: number; keepH: number;
  /** Keep extent along u (front face u, back face u). */
  keepFront: number; keepBack: number;
  house: CastleHouse | null;
  // Garrison places (held castles only; heights are local, 1 = courtyard floor).
  gatePosts: Spot[];
  watch: Spot[];
  /** Wall-walk patrol legs: [u0, v0, u1, v1] at height wallH + 1. */
  patrols: Array<[number, number, number, number]>;
  drill: Spot[];
  captain: Spot;
  dummies: Spot[];
  strikers: Spot[];
  butts: Spot[];
  shooters: Spot[];
  braziers: Spot[];
  tents: Spot[];
  keepDoor: Spot;
  /** Foot and head of the wall stairs on the +v side (mirrored on -v). */
  stairs: [Spot, Spot];
}

const FOUNDATION = 12;
const MAX_UP = 44;
/** Longest gate ramp (blocks beyond the levelled pad). */
const RAMP = 12;

const spot = (u: number, v: number, y: number, fu: number, fv: number): Spot => ({ u, v, y, fu, fv });

/** Where (u) the gate ramp meets the natural ground. */
export function rampFoot(L: CastleLayout, ground: (x: number, z: number) => number): number {
  for (let i = 1; i <= RAMP; i++) {
    const u = L.half + 4 + i;
    const gy = Math.floor(ground(L.cx + L.gx * u + 0.5, L.cz + L.gz * u + 0.5)) - L.floorY;
    if (Math.abs(gy) <= i) return u;
  }
  return L.half + 4 + RAMP;
}

/** World position of a castle-local point. */
export function castleWorld(L: CastleLayout, u: number, v: number): [number, number] {
  return [L.cx + L.gx * u + L.px * v + 0.5, L.cz + L.gz * u + L.pz * v + 0.5];
}

/** World yaw (models face +Z) of a castle-local direction. */
export function castleYaw(L: CastleLayout, fu: number, fv: number): number {
  return Math.atan2(L.gx * fu + L.px * fv, L.gz * fu + L.pz * fv);
}

/**
 * gate: 0 = +X, 1 = -X, 2 = +Z, 3 = -Z side of the curtain wall.
 */
export function castleLayout(site: Site, seed: number, gate: number): CastleLayout {
  const r = (k: number) => hash01(site.gx * 97 + k, 811 + k, site.gz * 61 - k, seed);
  const held = !!site.held;
  const half = held ? 16 + Math.floor(r(1) * 4) : 13 + Math.floor(r(1) * 5);
  const wallH = held ? 8 + Math.floor(r(3) * 2) : 7 + Math.floor(r(3) * 3);
  const gx = gate === 0 ? 1 : gate === 1 ? -1 : 0;
  const gz = gate === 2 ? 1 : gate === 3 ? -1 : 0;
  const kw = 3 + Math.floor(r(9) * 2), kd = 3 + Math.floor(r(10) * 2);
  const keepH = 18 + Math.floor(r(11) * 7);
  const ku = gx !== 0 ? kw : kd, kv = gx !== 0 ? kd : kw;
  const inner = half - 3;
  const keepFront = -3 + ku, keepBack = -3 - ku;
  const L: CastleLayout = {
    held, half, inner, wallH, gate, gx, gz, px: -gz, pz: gx, cx: site.x, cz: site.z, floorY: Math.floor(site.h),
    kw, kd, keepH, keepFront, keepBack, house: held ? castleHouse(site, seed) : null,
    gatePosts: [], watch: [], patrols: [], drill: [], captain: spot(0, 0, 1, 0, 1), dummies: [], strikers: [], butts: [], shooters: [],
    braziers: [], tents: [], keepDoor: spot(keepFront + 2, 0, 1, 1, 0), stairs: [spot(inner, 4, 1, 0, 1), spot(inner + 1, 3 + wallH, wallH + 1, 0, 1)],
  };
  if (!held) return L;
  const top = wallH + 1;
  // Gate: two sentries outside, two watchers on the walls (over the gate and the back).
  L.gatePosts.push(spot(half + 2, -2.2, 1, 1, 0), spot(half + 2, 2.2, 1, 1, 0));
  L.watch.push(spot(half - 1, 0, top, 1, 0), spot(-(half - 1), 0, top, -1, 0));
  // Wall walk: the side and back walls between the corner towers.
  const end = half - 4.5;
  L.patrols.push([-end, half - 1, end, half - 1], [-end, -(half - 1), end, -(half - 1)], [-(half - 1), -end, -(half - 1), end]);
  // Parade ground on the +v side of the gate path: two ranks of three facing the captain.
  const uc = Math.round((keepFront + inner) / 2);
  for (const v of [5.5, 7.5]) for (const du of [-2, 0, 2]) L.drill.push(spot(uc + du, v, 1, 0, -1));
  L.captain = spot(uc, 3, 1, 0, 1);
  // Training dummies along the -v wall, a striker in front of each.
  for (let u = keepFront + 3; u <= inner - 4; u += 3) {
    L.dummies.push(spot(u, -(inner - 1), 1, 0, 1));
    L.strikers.push(spot(u, -(inner - 1) + 1.5, 1, 0, -1));
  }
  // Archery: butts against the back wall on the +v side, the line near the gate.
  for (const v of [inner - 1, inner - 3]) {
    L.butts.push(spot(-(inner - 1), v, 1, 1, 0));
    L.shooters.push(spot(inner - 3, v, 1, -1, 0));
  }
  L.braziers.push(spot(keepFront + 1, -3, 3, 0, 0), spot(keepFront + 1, 3, 3, 0, 0), spot(inner - 1, -3, 3, 0, 0), spot(inner - 1, 3, 3, 0, 0));
  // Tents behind the keep on the -v side.
  L.tents.push(spot(Math.round((keepBack - inner) / 2), -(kv + 3), 1, 1, 0));
  if (inner >= kv + 10) L.tents.push(spot(Math.round((keepBack - inner) / 2), -(kv + 8), 1, 1, 0));
  return L;
}

/**
 * ground: natural terrain height at a world column (when given, a ramp joins the
 * gate to the surrounding ground, since the castle stands on a levelled pad).
 */
export function buildCastle(site: Site, seed: number, gate: number, ground?: (x: number, z: number) => number): CastlePlan {
  const r = (k: number) => hash01(site.gx * 97 + k, 811 + k, site.gz * 61 - k, seed);
  const L = castleLayout(site, seed, gate);
  const { held, half, wallH } = L;
  const reach = half + 6 + RAMP;
  const w = reach * 2 + 1, d = w, h = FOUNDATION + MAX_UP;
  const cells = new Uint8Array(w * h * d);
  const floorY = L.floorY;
  const ox = site.x - reach, oz = site.z - reach, oy = floorY - FOUNDATION;
  const at = (x: number, y: number, z: number) => (y * d + z) * w + x;
  const Lc = (wx: number) => wx + reach; // site-relative -> local
  const set = (x: number, y: number, z: number, b: number) => {
    const lx = Lc(x), lz = Lc(z), ly = y + FOUNDATION;
    if (lx < 0 || lz < 0 || lx >= w || lz >= d || ly < 0 || ly >= h) return;
    cells[at(lx, ly, lz)] = b;
  };
  const get = (x: number, y: number, z: number) => {
    const lx = Lc(x), lz = Lc(z), ly = y + FOUNDATION;
    if (lx < 0 || lz < 0 || lx >= w || lz >= d || ly < 0 || ly >= h) return C_KEEP;
    return cells[at(lx, ly, lz)];
  };
  // Castle-local (u towards the gate, v along the gate wall) to site-relative.
  const { gx, gz, px, pz } = L;
  const setUV = (u: number, y: number, v: number, b: number) => set(gx * u + px * v, y, gz * u + pz * v, b);
  const getUV = (u: number, y: number, v: number) => get(gx * u + px * v, y, gz * u + pz * v);
  const noise = (x: number, y: number, z: number, k: number) => hash01(site.x + x, y * 7 + k, site.z + z, seed);

  const wallBlock = (x: number, y: number, z: number): number => {
    const n = noise(x, y, z, 1);
    if (held) {
      if (y < 2) return n < 0.15 ? B.MOSSY_BRICKS : n < 0.45 ? B.COBBLE : B.STONE_BRICKS;
      return n < 0.86 ? B.STONE_BRICKS : n < 0.94 ? B.COBBLE : B.CRACKED_BRICKS;
    }
    if (y < 2) return n < 0.4 ? B.MOSSY_BRICKS : n < 0.7 ? B.COBBLE : B.STONE_BRICKS;
    return n < 0.55 ? B.STONE_BRICKS : n < 0.75 ? B.MOSSY_BRICKS : n < 0.92 ? B.CRACKED_BRICKS : B.COBBLE;
  };

  // Ruin: big collapsed sections (low-frequency) plus random missing stones near the top.
  const ruinSeed = r(2) * 100;
  const collapsed = (x: number, z: number): number => {
    if (held) return 0;
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
      if (held) set(x, 0, z, n < 0.4 ? B.PATH : n < 0.65 ? B.GRAVEL : n < 0.88 ? B.COBBLE : B.STONE_BRICKS);
      else set(x, 0, z, n < 0.35 ? B.COBBLE : n < 0.55 ? B.MOSS_STONE : n < 0.7 ? B.GRAVEL : n < 0.85 ? B.PATH : B.STONE_BRICKS);
      for (let y = 1; y < MAX_UP; y++) set(x, y, z, C_AIR);
    }
  }
  // A paved way from the gate to the keep door.
  if (held) for (let u = L.keepFront; u <= half + 4; u++) for (let v = -1; v <= 1; v++) setUV(u, 0, v, noise(u, 0, v, 9) < 0.8 ? B.STONE_BRICKS : B.COBBLE);

  // --- curtain wall with crenellations (2 thick in ruins, 3 with a wall walk when held)
  const thick = held ? 2 : 1;
  for (let z = -half; z <= half; z++) {
    for (let x = -half; x <= half; x++) {
      const ring = Math.max(Math.abs(x), Math.abs(z));
      if (ring < half - thick) continue;
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
    // One corner tower of a ruin is usually a broken stump.
    const broken = !held && i === Math.floor(r(5) * 4) && r(6) < 0.7;
    tower(x, z, 3, broken ? 5 + Math.floor(r(7) * 4) : cornerH, held || (!broken && r(8 + i) < 0.6), held ? 0.55 : 0.25);
  });

  // --- gatehouse: opening through the wall, flanking towers, lanterns
  for (const side of [-1, 1]) tower(gx * half + px * side * 4, gz * half + pz * side * 4, 2, wallH + 3, false, 0.6);
  for (let s = -1; s <= 1; s++) {
    for (let depth = -1 - thick; depth <= 1; depth++) {
      for (let y = 1; y <= 4; y++) set(gx * (half + depth) + px * s, y, gz * (half + depth) + pz * s, C_AIR);
    }
  }
  for (const side of [-2, 2]) set(gx * (half + 1) + px * side, 4, gz * (half + 1) + pz * side, B.LANTERN);
  // A cobbled approach leading out of the gate, then a ramp down (or up) to the
  // natural ground one block per step, so people and monsters can walk in.
  for (let k = 1; k <= 4; k++) for (let s = -1; s <= 1; s++) set(gx * (half + k) + px * s, 0, gz * (half + k) + pz * s, B.COBBLE);
  if (ground) {
    const foot = rampFoot(L, ground);
    for (let i = 1; half + 4 + i <= foot; i++) {
      const u = half + 4 + i;
      const gy = Math.floor(ground(site.x + gx * u + 0.5, site.z + gz * u + 0.5)) - floorY;
      const y = Math.max(-i, Math.min(i, gy));
      for (let s = -2; s <= 2; s++) {
        const x = gx * u + px * s, z = gz * u + pz * s;
        for (let k = y - 8; k < y; k++) set(x, k, z, C_FILL);
        set(x, y, z, Math.abs(s) <= 1 ? B.COBBLE : B.GRAVEL);
        for (let k = y + 1; k <= y + 5; k++) set(x, k, z, C_AIR);
      }
    }
  }

  // --- keep: tall hollow block with floors, lit windows and a slate roof
  const { kw, kd, keepH } = L;
  const kx = -gx * 3, kz = -gz * 3; // set back from the gate
  for (let z = -kd; z <= kd; z++) {
    for (let x = -kw; x <= kw; x++) {
      const edge = Math.abs(x) === kw || Math.abs(z) === kd;
      for (let y = 1; y <= keepH; y++) {
        const wx = kx + x, wz = kz + z;
        if (!edge) { set(wx, y, wz, y % 6 === 0 ? B.DARK_PLANKS : C_AIR); continue; }
        const corner = Math.abs(x) === kw && Math.abs(z) === kd;
        const window = !corner && y % 6 === 3 && (Math.abs(x) % 2 === 1 || Math.abs(z) % 2 === 1) && y > 2;
        set(wx, y, wz, window ? (noise(wx, y, wz, 6) < (held ? 0.7 : 0.45) ? B.WINDOW_LIT : B.WINDOW_DARK) : wallBlock(wx, y, wz));
      }
      // stepped slate roof
      const ring = Math.max(Math.abs(x) / kw, Math.abs(z) / kd);
      const steps = Math.min(kw, kd) + 1;
      const level = Math.round((1 - ring) * steps);
      for (let k = 0; k <= level; k++) set(kx + x, keepH + 1 + k, kz + z, B.SLATE);
    }
  }
  const spireBase = keepH + Math.min(kw, kd) + 3;
  if (held) {
    // A flagpole with the house banner streaming out along the gate wall.
    for (let k = 0; k < 6; k++) set(kx, spireBase + k, kz, B.DARK_PLANKS);
    for (let k = 1; k <= 3; k++) for (const y of [spireBase + 4, spireBase + 5]) set(kx + px * k, y, kz + pz * k, L.house!.banner);
  } else {
    for (let k = 0; k < 4; k++) set(kx, spireBase + k, kz, k === 3 ? B.LANTERN : B.SLATE);
  }
  // keep door facing the gate
  for (let y = 1; y <= 3; y++) set(kx + gx * kw, y, kz + gz * kd, C_AIR);

  if (held) furnish();
  else ivy();

  return { ox, oy, oz, w, h, d, cells, half: half + 4, cx: site.x, cz: site.z, floorY };

  /** Banners, stairs, parade-ground furniture of a held castle. */
  function furnish(): void {
    const banner = L.house!.banner;
    const hang = (u: number, v: number, y0: number, len: number) => { for (let k = 0; k < len; k++) setUV(u, y0 - k, v, banner); };
    // On the outer faces of the walls, and over the keep door.
    for (const v of [-9, 9]) hang(half + 1, v, wallH, 4);
    for (const s of [-7, 7]) { hang(s, half + 1, wallH, 4); hang(s, -(half + 1), wallH, 4); hang(-(half + 1), s, wallH, 4); }
    hang(L.keepFront + 1, 0, 9, 4);
    // Stairs up to the wall walk, along the inside of the gate wall on both sides of the gate.
    const [foot] = L.stairs;
    for (const side of [1, -1]) {
      for (let k = 0; k < wallH; k++) for (let y = 1; y <= k + 1; y++) setUV(foot.u, y, side * (foot.v + k), y === k + 1 ? B.STONE_BRICKS : B.COBBLE);
    }
    // Braziers: a stone stand with an iron bowl (the fire burns at night).
    for (const b of L.braziers) { setUV(b.u, 1, b.v, B.STONE_BRICKS); setUV(b.u, 2, b.v, B.STEEL); }
    // Training dummies: a post with a straw body.
    for (const t of L.dummies) { setUV(t.u, 1, t.v, B.OAK_LOG); setUV(t.u, 2, t.v, B.HAY); }
    // A weapon rack and crates by the dummies.
    const rackU = L.keepFront + 1;
    setUV(rackU, 1, -(L.inner - 1), B.CRATE); setUV(rackU, 2, -(L.inner - 1), B.CRATE); setUV(rackU, 1, -(L.inner - 2), B.CRATE);
    // Archery butts: straw stacks on a plank frame.
    for (const b of L.butts) { setUV(b.u, 1, b.v, B.DARK_PLANKS); setUV(b.u, 2, b.v, B.HAY); setUV(b.u - 1, 1, b.v, B.HAY); }
    // Tents: cloth A-frames with the ridge along u, one in the house colour.
    L.tents.forEach((t, i) => {
      const cloth = i === 0 ? banner : B.CLOTH_YELLOW;
      for (let du = -2; du <= 1; du++) {
        for (let k = 0; k <= 2; k++) {
          setUV(t.u + du, 1 + k, t.v - (2 - k), cloth);
          setUV(t.u + du, 1 + k, t.v + (2 - k), cloth);
        }
      }
      setUV(t.u - 3, 1, t.v, B.HAY); setUV(t.u + 2, 1, t.v + 2, B.CRATE);
    });
    // Hay for the horses and a water trough near the back wall.
    const sb = -(L.inner);
    for (const v of [-2, -1, 1]) setUV(sb, 1, v, B.HAY);
    setUV(sb, 2, -1, B.HAY);
    // Lanterns along the wall walk's inner edge so the patrols have light.
    for (const s of [-8, 0, 8]) {
      for (const [u, v] of [[s, half - 3], [s, -(half - 3)], [-(half - 3), s]] as Array<[number, number]>) {
        if (getUV(u, wallH, v) === C_AIR) setUV(u, wallH, v, B.LANTERN);
      }
    }
  }

  /** Ivy hanging down the outer faces of a ruin's walls and towers. */
  function ivy(): void {
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
  }
}
