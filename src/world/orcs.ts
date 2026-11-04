// Orc camps in the dry lands. Every camp is a ring of sharpened logs around
// hide huts and a bonfire; the one orc capital (the "orda") adds a chief's hall
// with a throne, a great war drum, an arena, a wolf pen, a smithy, a javelin
// range and two watch towers by the gate. Laid out once per site (the same
// deterministic layout tells the orcs where to stand) and turned into a voxel
// plan that is stamped like villages.

import { hash01 } from '../engine/noise';
import { B, PARTIAL, SEA } from './blocks';
import { BIOME } from './biomes';
import { C_AIR, C_FILL, C_KEEP, type CastlePlan } from './castle';
import { pointAlong, polylineLength, type Site } from './structures';
import type { SignRecord } from './stamp';
import type { Terrain } from './terrain';

/** A place to stand: world block coords (feet on top of block y), facing yaw (atan2(dx, dz)). */
export interface OrcSpot { x: number; z: number; y: number; yaw: number }
export interface Ring { x: number; z: number; r: number }
export interface Hut { x: number; z: number; r: number; yaw: number; big: boolean }

export interface OrcLayout {
  site: Site;
  capital: boolean;
  floorY: number;
  /** Palisade radius; the plan reaches a little further (ground blending). */
  R: number;
  reach: number;
  /** Direction of the gate from the centre (radians, x = cos, z = sin). */
  gateA: number;
  /** Just outside and just inside the gate. */
  gateOut: [number, number];
  gateIn: [number, number];
  huts: Hut[];
  /** Bonfires (the big one in the middle first). */
  fires: OrcSpot[];
  totems: OrcSpot[];
  /** The war drum and the drummers' places. */
  drumAt: [number, number] | null;
  drummers: OrcSpot[];
  hall: { x: number; z: number; hw: number; hd: number; fx: number; fz: number } | null;
  /** The chief's place on the dais in front of the throne. */
  throne: OrcSpot | null;
  /** The smith's place (facing the anvil) and the anvil. */
  forge: OrcSpot | null;
  anvil: [number, number, number] | null;
  arena: Ring | null;
  pen: Ring | null;
  range: { target: [number, number, number]; throwers: OrcSpot[] } | null;
  /** Standing places on the watch tower platforms. */
  towers: OrcSpot[];
  guards: OrcSpot[];
  woodpile: OrcSpot | null;
  racks: OrcSpot[];
  /** Seats round the big fire (night gatherings). */
  seats: OrcSpot[];
}

export interface OrcPlan extends CastlePlan {
  texts: SignRecord[];
}

const DOWN = 14, UP = 26;
const TAU = Math.PI * 2;
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);

const layoutCache = new Map<string, OrcLayout>();

export function orcLayout(t: Terrain, site: Site): OrcLayout {
  const key = `${t.seed}:${site.id}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const L = buildLayout(t, site);
  if (layoutCache.size > 16) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, L);
  return L;
}

function buildLayout(t: Terrain, site: Site): OrcLayout {
  const cap = !!site.capital;
  const seed = t.seed;
  const rnd = (k: number) => hash01(site.gx * 97 + k, 3100 + k, site.gz * 53 - k, seed);
  const R = cap ? 40 : 18;
  const cx = site.x, cz = site.z, Y = Math.floor(site.h);
  // The gate faces where the first road comes in.
  let G = rnd(1) * TAU;
  const road = t.structures.roadsOf(site)[0];
  if (road) {
    const len = polylineLength(road.pts);
    const [px, pz] = road.a === site ? pointAlong(road.pts, R + 8) : pointAlong(road.pts, len - R - 8);
    G = Math.atan2(pz - cz, px - cx);
  }
  const P = (a: number, d: number): [number, number] => [Math.round(cx + Math.cos(G + a) * d), Math.round(cz + Math.sin(G + a) * d)];
  /** Offset sideways from the gate axis: d along it, s across. */
  const Q = (d: number, s: number): [number, number] => [
    Math.round(cx + Math.cos(G) * d - Math.sin(G) * s), Math.round(cz + Math.sin(G) * d + Math.cos(G) * s),
  ];
  const spot = (x: number, z: number, yaw: number, y = Y): OrcSpot => ({ x, z, y, yaw });
  const facing = (x: number, z: number, tx: number, tz: number, y = Y) => spot(x, z, yawTo(x, z, tx, tz), y);
  const taken: Ring[] = [];
  const reserve = (x: number, z: number, r: number) => taken.push({ x, z, r });
  const clear = (x: number, z: number, r: number) => !taken.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r);

  const gateOut = Q(R + 3, 0), gateIn = Q(R - 4, 0);
  const fires: OrcSpot[] = [spot(cx, cz, 0)];
  reserve(cx, cz, cap ? 6 : 4);
  const seats: OrcSpot[] = [];
  const nSeats = cap ? 10 : 6, seatR = cap ? 4.5 : 3.2;
  for (let i = 0; i < nSeats; i++) {
    const a = (i / nSeats) * TAU + 0.3;
    const x = cx + Math.cos(a) * seatR, z = cz + Math.sin(a) * seatR;
    seats.push(facing(x, z, cx, cz));
  }

  const totems: OrcSpot[] = [];
  const towers: OrcSpot[] = [];
  const guards: OrcSpot[] = [];
  const racks: OrcSpot[] = [];
  let drumAt: [number, number] | null = null;
  const drummers: OrcSpot[] = [];
  let hall: OrcLayout['hall'] = null, throne: OrcSpot | null = null, forge: OrcSpot | null = null, anvil: OrcLayout['anvil'] = null;
  let arena: Ring | null = null, pen: Ring | null = null, range: OrcLayout['range'] = null, woodpile: OrcSpot | null = null;

  // Gate lane: nothing stands between the gate and the fire.
  const inLane = (x: number, z: number, r: number) => {
    const dx = x - cx, dz = z - cz;
    const along = dx * Math.cos(G) + dz * Math.sin(G), across = -dx * Math.sin(G) + dz * Math.cos(G);
    return along > -2 && Math.abs(across) < 3.5 + r;
  };

  for (const s of [-1, 1]) {
    const [x, z] = Q(R + 2, s * 3.4);
    guards.push(spot(x, z, yawTo(cx, cz, ...Q(R + 30, 0))));
  }
  for (const s of cap ? [-1, 1] : [1]) {
    const [x, z] = Q(R - 3, s * 5.5);
    towers.push(spot(x, z, yawTo(cx, cz, ...Q(R + 30, 0)), Y + 6));
    reserve(x, z, 2.5);
  }
  for (const s of [-1, 1]) {
    const [x, z] = Q(R - (cap ? 7 : 4), s * 4);
    totems.push(spot(x, z, 0));
    reserve(x, z, 1);
  }

  if (cap) {
    // The chief's hall at the back, its door towards the fire; the throne on a dais before it.
    const [hx, hz] = P(Math.PI, 21);
    const fx = Math.round(-Math.cos(G)), fz = Math.round(-Math.sin(G));
    const ax = Math.abs(Math.cos(G)) > Math.abs(Math.sin(G));
    // The hall is axis aligned: its door faces the axis direction nearest the fire.
    const [dfx, dfz] = ax ? [Math.sign(cx - hx), 0] : [0, Math.sign(cz - hz)];
    hall = { x: hx, z: hz, hw: 4, hd: 6, fx: dfx || fx, fz: dfz || fz };
    reserve(hx, hz, 8);
    const tx = hx + hall.fx * (hall.hd + 3), tz = hz + hall.fz * (hall.hd + 3);
    throne = facing(tx, tz, cx, cz, Y + 1);
    reserve(tx, tz, 3);
    // The great drum beside the fire.
    const [dx, dz] = P(Math.PI / 2, 9);
    drumAt = [dx, dz];
    reserve(dx, dz, 3);
    // One drummer either side, across the line to the fire.
    for (const s of [-1, 1]) {
      const x = dx + 0.5 - Math.sin(G + Math.PI / 2) * s * 2.4, z = dz + 0.5 + Math.cos(G + Math.PI / 2) * s * 2.4;
      drummers.push(facing(x, z, dx + 0.5, dz + 0.5));
    }
    // Totems round the fire.
    for (let k = 0; k < 4; k++) {
      const [x, z] = P(Math.PI / 4 + (k * Math.PI) / 2, 7.5);
      if (Math.hypot(x - dx, z - dz) < 3.5) continue;
      totems.push(spot(x, z, 0));
      reserve(x, z, 1);
    }
    // Arena, wolf pen, smithy, javelin range.
    const [ax0, az0] = P(-0.55 * Math.PI, 24);
    arena = { x: ax0, z: az0, r: 7 };
    reserve(ax0, az0, 9);
    // Keep a way open from the fire to the arena (the chief walks over to watch).
    for (let d = 8; d < 17; d += 2.5) { const [x, z] = P(-0.55 * Math.PI, d); reserve(x, z, 1.6); }
    const [px0, pz0] = P(0.6 * Math.PI, 25);
    pen = { x: px0, z: pz0, r: 6 };
    reserve(px0, pz0, 7.5);
    const [sx, sz] = P(0.8 * Math.PI, 23);
    anvil = [sx, Y + 1, sz];
    forge = facing(sx + Math.sign(cx - sx) * 1, sz, sx, sz);
    reserve(sx, sz, 4.5);
    const [rtx, rtz] = P(-0.8 * Math.PI, 33);
    const throwers: OrcSpot[] = [];
    for (const s of [-1.6, 1.6]) {
      const a = G - 0.8 * Math.PI;
      const x = cx + Math.cos(a) * 20 - Math.sin(a) * s, z = cz + Math.sin(a) * 20 + Math.cos(a) * s;
      throwers.push(facing(x, z, rtx, rtz));
    }
    range = { target: [rtx, Y + 2, rtz], throwers };
    reserve(rtx, rtz, 2);
    for (let d = 20; d < 33; d += 3) { const [x, z] = P(-0.8 * Math.PI, d); reserve(x, z, 1.8); }
    const [wx, wz] = P(0.32 * Math.PI, 31);
    woodpile = facing(wx + Math.sign(cx - wx), wz, wx, wz);
    reserve(wx, wz, 2.5);
    // Workers carry wood from the pile to the great fire: keep the way clear.
    for (let d = 8; d < 29; d += 2.5) { const [x, z] = P(0.32 * Math.PI, d); reserve(x, z, 1.6); }
    for (const [a, d] of [[-0.3 * Math.PI, 31], [0.22 * Math.PI, 17], [-0.2 * Math.PI, 14]] as const) {
      const [x, z] = P(a, d);
      if (!clear(x, z, 1.5) || inLane(x, z, 1.5)) continue;
      racks.push(facing(x + Math.round(Math.cos(G + a + Math.PI)), z + Math.round(Math.sin(G + a + Math.PI)), x, z));
      reserve(x, z, 2);
    }
    for (const [a, d] of [[0.35 * Math.PI, 15], [-0.33 * Math.PI, 14], [Math.PI, 31]] as const) {
      const [x, z] = P(a, d);
      if (!clear(x, z, 1.5)) continue;
      fires.push(spot(x, z, 0));
      reserve(x, z, 2.5);
    }
  } else {
    const [dx, dz] = P(Math.PI / 2, 4.6);
    drumAt = [dx, dz];
    drummers.push(facing(dx + Math.round(Math.cos(G + Math.PI / 2)), dz + Math.round(Math.sin(G + Math.PI / 2)), dx + 0.5, dz + 0.5));
    reserve(dx, dz, 1.5);
    const [rx, rz] = P(-Math.PI / 2, 10);
    racks.push(facing(rx + Math.round(Math.cos(G + Math.PI / 2)), rz + Math.round(Math.sin(G + Math.PI / 2)), rx, rz));
    reserve(rx, rz, 2);
    const [wx, wz] = P(0.65 * Math.PI, 11);
    woodpile = facing(wx + Math.sign(cx - wx), wz, wx, wz);
    reserve(wx, wz, 2);
    for (let d = 5; d < 10; d += 2) { const [x, z] = P(0.65 * Math.PI, d); reserve(x, z, 1.4); }
  }

  // Huts fill the rest, doors towards the fire.
  const huts: Hut[] = [];
  const rings = cap ? [14, 19.5, 25, 30.5, 35] : [8.5, 13];
  const want = cap ? 22 : 4 + Math.floor(rnd(2) * 3);
  for (const d of rings) {
    const r = cap ? (d < 18 ? 3.8 : 3.0) : 2.8;
    if (d + r > R - 1.5) continue;
    // Twice as many tries as fit, so gaps between the big features get filled too.
    const n = Math.floor((TAU * d) / (r * 2 + 2.4)) * 2;
    const off = rnd(10 + d) * TAU;
    for (let i = 0; i < n && huts.length < want; i++) {
      const a = off + (i / n) * TAU;
      const x = Math.round(cx + Math.cos(a) * d), z = Math.round(cz + Math.sin(a) * d);
      if (!clear(x, z, r + 0.9) || inLane(x, z, r)) continue;
      // Dry, level ground only (no point in a hut on a stilt).
      const g = t.sample(x, z);
      if (g.h < SEA + 1 || g.river > 0.05) continue;
      huts.push({ x, z, r, yaw: yawTo(x, z, cx, cz), big: cap && d < 18 });
      reserve(x, z, r + 1);
    }
  }
  return {
    site, capital: cap, floorY: Y, R, reach: R + 11, gateA: G, gateOut, gateIn, huts, fires, totems, drumAt, drummers,
    hall, throne, forge, anvil, arena, pen, range, towers, guards, woodpile, racks, seats,
  };
}

// ------------------------------------------------------------------ voxels

class Grid {
  readonly cells: Uint8Array;
  readonly w: number;
  readonly h = DOWN + UP;
  readonly ox: number; readonly oz: number; readonly oy: number;
  constructor(cx: number, cz: number, y: number, readonly reach: number) {
    this.w = reach * 2 + 1;
    this.cells = new Uint8Array(this.w * this.h * this.w);
    this.ox = cx - reach; this.oz = cz - reach; this.oy = y - DOWN;
  }
  set(x: number, y: number, z: number, b: number): void {
    const lx = x - this.ox, lz = z - this.oz, ly = y - this.oy;
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.w || ly < 0 || ly >= this.h) return;
    this.cells[(ly * this.w + lz) * this.w + lx] = b;
  }
  get(x: number, y: number, z: number): number {
    const lx = x - this.ox, lz = z - this.oz, ly = y - this.oy;
    if (lx < 0 || lz < 0 || lx >= this.w || lz >= this.w || ly < 0 || ly >= this.h) return C_KEEP;
    return this.cells[(ly * this.w + lz) * this.w + lx];
  }
  /** Ground at y: foundation below (where terrain is missing), the top block, air above. */
  pad(x: number, z: number, y: number, top: number, clear: number): void {
    for (let yy = this.oy; yy < y; yy++) this.set(x, yy, z, C_FILL);
    this.set(x, y, z, top);
    for (let yy = y + 1; yy <= y + clear; yy++) this.set(x, yy, z, C_AIR);
  }
}

function surfaceFor(biome: number): number {
  return biome === BIOME.BADLANDS ? B.CLAY_TAN : B.SAND;
}

export function buildOrcPlan(t: Terrain, site: Site): OrcPlan {
  const L = orcLayout(t, site);
  const { R, floorY: Y } = L;
  const cx = site.x, cz = site.z;
  const g = new Grid(cx, cz, Y, L.reach);
  const texts: SignRecord[] = [];
  const n = (x: number, y: number, z: number, k = 0) => hash01(x, y * 7 + 3300 + k, z, t.seed);
  const half = (b: number) => PARTIAL.get(b)?.[1] ?? b;
  const surface = surfaceFor(t.sample(cx, cz).biome);
  const G = L.gateA, gc = Math.cos(G), gs = Math.sin(G);
  const local = (x: number, z: number): [number, number] => {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    return [dx * gc + dz * gs, -dx * gs + dz * gc];
  };

  // --- ground: a level yard inside the ring, blended into the land outside
  for (let z = cz - L.reach; z <= cz + L.reach; z++) for (let x = cx - L.reach; x <= cx + L.reach; x++) {
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (r > L.reach) continue;
    const [along, across] = local(x, z);
    if (r <= R + 1.5) {
      const lane = along > 0 && Math.abs(across) < 2.2;
      const k = n(x, 1, z);
      const top = lane ? (k < 0.8 ? B.PATH : B.GRAVEL) : k < 0.62 ? surface : k < 0.86 ? B.PATH : k < 0.96 ? B.GRAVEL : B.DIRT;
      g.pad(x, z, Y, top, UP - 2);
      continue;
    }
    const h = Math.floor(t.sample(x + 0.5, z + 0.5).h);
    if (h < SEA) continue;
    const s = Math.min(1, (r - R - 1.5) / (L.reach - R - 2));
    const k = s * s * (3 - 2 * s);
    const y = Math.round(Y + (h - Y) * k);
    if (y === h) continue;
    g.pad(x, z, y, Math.abs(along - R - 4) < 3 && Math.abs(across) < 2.2 ? B.PATH : surface, Math.max(4, h - y + 3));
  }

  // --- palisade: sharpened logs, a gap for the gate
  for (let z = cz - R - 2; z <= cz + R + 2; z++) for (let x = cx - R - 2; x <= cx + R + 2; x++) {
    const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (Math.abs(r - R) > 0.75) continue;
    const [along, across] = local(x, z);
    if (along > 0 && Math.abs(across) < 2.6) continue;
    const top = Y + (n(x, 2, z) < 0.5 ? 4 : 5);
    const tip = n(x, 13, z) < 0.2 ? B.CHARRED_LOG : B.SPRUCE_LOG;
    for (let y = Y + 1; y <= top; y++) g.set(x, y, z, y === top ? tip : B.SPRUCE_LOG);
    if (n(x, 3, z) < 0.04) g.set(x, top + 1, z, B.SKULL);
  }
  // Gate posts, a crossbeam with the war banner, skulls on top.
  for (const s of [-1, 1]) {
    const px = Math.round(cx + gc * R - gs * s * 3.1), pz = Math.round(cz + gs * R + gc * s * 3.1);
    for (let y = Y + 1; y <= Y + 7; y++) g.set(px, y, pz, B.SPRUCE_LOG);
    g.set(px, Y + 8, pz, B.SKULL);
  }
  for (let s = -2; s <= 2; s++) {
    const x = Math.round(cx + gc * R - gs * s), z = Math.round(cz + gs * R + gc * s);
    g.set(x, Y + 7, z, B.DARK_PLANKS);
    if (Math.abs(s) <= 1) g.set(x, Y + 6, z, B.WAR_BANNER);
  }
  {
    const [x, z] = [Math.round(cx + gc * (R + 4) - gs * 4.6), Math.round(cz + gs * (R + 4) + gc * 4.6)];
    const y = Math.floor(t.sample(x + 0.5, z + 0.5).h);
    const ty = g.get(x, Y, z) !== C_KEEP ? Y + 1 : y + 1;
    texts.push({ x: x + 0.5, y: ty, z: z + 0.5, boards: [{ text: site.name, dx: gc, dz: gs }, { text: site.name, dx: -gc, dz: -gs }] });
  }

  // --- watch towers: four legs, a platform with a rail
  for (const tw of L.towers) {
    const top = tw.y;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = tw.x + dx, z = tw.z + dz;
      const corner = dx !== 0 && dz !== 0;
      if (corner) for (let y = Y + 1; y < top; y++) g.set(x, y, z, B.SPRUCE_LOG);
      g.set(x, top, z, corner ? B.SPRUCE_LOG : B.DARK_PLANKS);
      // Nothing over the middle: the lookout stands there.
      if (corner) { g.set(x, top + 1, z, B.SPRUCE_LOG); g.set(x, top + 2, z, B.CHARRED_LOG); g.set(x, top + 3, z, B.SKULL); }
      else if (dx !== 0 || dz !== 0) g.set(x, top + 1, z, half(B.PLANKS));
    }
  }

  // --- fires: a ring of stones round glowing embers (the flames are drawn live)
  L.fires.forEach((f, i) => {
    const big = i === 0 && L.capital;
    const rr = big ? 2.2 : 1.2;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= rr - 0.7) { g.set(f.x + dx, Y, f.z + dz, B.MAGMA); g.set(f.x + dx, Y + 1, f.z + dz, C_AIR); }
      else if (d <= rr + 0.6) g.set(f.x + dx, Y + 1, f.z + dz, half(B.COBBLE));
    }
    if (!big) g.set(f.x, Y + 1, f.z, B.CHARRED_LOG);
    else for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) g.set(f.x + dx, Y + 1, f.z + dz, B.CHARRED_LOG);
  });
  // Log seats round the big fire.
  for (const s of L.seats) {
    const bx = Math.round(s.x - Math.sin(s.yaw) * 0.9), bz = Math.round(s.z - Math.cos(s.yaw) * 0.9);
    if (g.get(bx, Y + 1, bz) === C_AIR) g.set(bx, Y + 1, bz, half(B.PLANKS));
  }

  // --- totems: a pole with skulls, a crossbar, a banner
  L.totems.forEach((tm, i) => {
    const hgt = 4 + Math.floor(n(tm.x, 4, tm.z) * 3);
    for (let y = Y + 1; y <= Y + hgt; y++) g.set(tm.x, y, tm.z, i % 2 ? B.SPRUCE_LOG : B.CHARRED_LOG);
    g.set(tm.x, Y + hgt + 1, tm.z, B.SKULL);
    if (hgt >= 5) g.set(tm.x, Y + hgt - 2, tm.z, B.SKULL);
    const [ox, oz] = Math.abs(gc) > Math.abs(gs) ? [0, 1] : [1, 0];
    g.set(tm.x + ox, Y + hgt - 1, tm.z + oz, B.DARK_PLANKS);
    g.set(tm.x - ox, Y + hgt - 1, tm.z - oz, B.DARK_PLANKS);
    g.set(tm.x + ox, Y + hgt - 2, tm.z + oz, B.WAR_BANNER);
    g.set(tm.x - ox, Y + hgt - 2, tm.z - oz, B.WAR_BANNER);
  });

  // --- war drum
  if (L.drumAt) {
    const [dx, dz] = L.drumAt;
    const r = L.capital ? 1 : 0;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      g.set(dx + a, Y + 1, dz + b, B.SPRUCE_LOG);
      g.set(dx + a, Y + 2, dz + b, B.HIDE);
    }
    if (L.capital) for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      for (let y = Y + 1; y <= Y + 4; y++) g.set(dx + a, y, dz + b, B.CHARRED_LOG);
      g.set(dx + a, Y + 5, dz + b, B.SKULL);
    }
  }

  // --- the chief's hall and throne
  if (L.hall) {
    const h = L.hall;
    const rx = -h.fz, rz = h.fx;
    const W = (lx: number, lz: number): [number, number] => [h.x + lx * rx + lz * h.fx, h.z + lx * rz + lz * h.fz];
    const top = Y + 5;
    for (let lz = -h.hd; lz <= h.hd; lz++) for (let lx = -h.hw; lx <= h.hw; lx++) {
      const [x, z] = W(lx, lz);
      const ex = Math.abs(lx) === h.hw, ez = Math.abs(lz) === h.hd;
      g.set(x, Y, z, ex || ez ? B.COBBLE : B.DARK_PLANKS);
      if (!ex && !ez) continue;
      for (let y = Y + 1; y <= top; y++) {
        const pillar = (ex && ez) || (ex && lz % 3 === 0) || (ez && lx % 2 === 0);
        g.set(x, y, z, pillar ? B.SPRUCE_LOG : y === Y + 1 ? B.DARK_PLANKS : B.HIDE);
      }
    }
    // Pitched hide roof, skulls along the ridge.
    for (let lz = -h.hd - 1; lz <= h.hd + 1; lz++) for (let lx = -h.hw - 1; lx <= h.hw + 1; lx++) {
      const [x, z] = W(lx, lz);
      const y = top + (h.hw + 1 - Math.abs(lx));
      g.set(x, y, z, B.HIDE);
      if (Math.abs(lz) <= h.hd && Math.abs(lx) <= h.hw) for (let yy = top + 1; yy < y; yy++) g.set(x, yy, z, Math.abs(lz) === h.hd ? B.HIDE : C_AIR);
      if (lx === 0 && lz % 3 === 0) g.set(x, y + 1, z, B.SKULL);
    }
    // Wide doorway with banners either side; a fire pit inside.
    for (let lx = -1; lx <= 1; lx++) for (let y = Y + 1; y <= Y + 3; y++) { const [x, z] = W(lx, h.hd); g.set(x, y, z, C_AIR); }
    for (const s of [-2, 2]) for (let y = Y + 2; y <= Y + 4; y++) { const [x, z] = W(s, h.hd + 1); g.set(x, y, z, B.WAR_BANNER); }
    { const [x, z] = W(0, -2); g.set(x, Y, z, B.MAGMA); g.set(x, Y + 1, z, B.CHARRED_LOG); }
    for (const lz of [-h.hd + 1, h.hd - 2]) for (const s of [-h.hw + 1, h.hw - 1]) { const [x, z] = W(s, lz); g.set(x, Y + 1, z, B.CRATE); }
  }
  if (L.throne) {
    const th = L.throne;
    const fx = Math.round(Math.sin(th.yaw)), fz = Math.round(Math.cos(th.yaw));
    const [ufx, ufz] = Math.abs(fx) >= Math.abs(fz) ? [Math.sign(fx), 0] : [0, Math.sign(fz)];
    const rx = -ufz, rz = ufx;
    // Dais: 5 wide, 3 deep, one step up, with a half-step in front.
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 1; b++) {
      const x = th.x + rx * a + ufx * b, z = th.z + rz * a + ufz * b;
      g.set(x, Y + 1, z, b === 1 ? half(B.COBBLE) : B.COBBLE);
    }
    // The throne: dark planks, a high back with skulls and a banner either side.
    const bx = th.x - ufx * 1, bz = th.z - ufz * 1;
    g.set(bx, Y + 2, bz, half(B.PLANKS));
    for (let y = Y + 2; y <= Y + 5; y++) g.set(bx - ufx, y, bz - ufz, B.DARK_PLANKS);
    g.set(bx - ufx, Y + 6, bz - ufz, B.SKULL);
    for (const s of [-1, 1]) {
      g.set(bx + rx * s, Y + 2, bz + rz * s, B.DARK_PLANKS);
      g.set(bx + rx * s - ufx, Y + 2, bz + rz * s - ufz, B.DARK_PLANKS);
      g.set(bx + rx * s - ufx, Y + 3, bz + rz * s - ufz, B.SKULL);
      for (let y = Y + 2; y <= Y + 5; y++) g.set(th.x + rx * s * 2 - ufx * 2, y, th.z + rz * s * 2 - ufz * 2, B.SPRUCE_LOG);
      g.set(th.x + rx * s * 2 - ufx * 2, Y + 6, th.z + rz * s * 2 - ufz * 2, B.SKULL);
      g.set(th.x + rx * s * 2 - ufx * 1, Y + 4, th.z + rz * s * 2 - ufz * 1, B.WAR_BANNER);
      g.set(th.x + rx * s * 2 - ufx * 1, Y + 3, th.z + rz * s * 2 - ufz * 1, B.WAR_BANNER);
    }
  }

  // --- arena: a low log ring with a sand floor, skull posts, an opening towards the fire
  if (L.arena) {
    const A = L.arena;
    const open = Math.atan2(cz - A.z, cx - A.x);
    for (let dz = -A.r - 1; dz <= A.r + 1; dz++) for (let dx = -A.r - 1; dx <= A.r + 1; dx++) {
      const d = Math.hypot(dx, dz), x = A.x + dx, z = A.z + dz;
      if (d < A.r - 0.5) { g.set(x, Y, z, n(x, 5, z) < 0.85 ? B.SAND : B.GRAVEL); continue; }
      if (d > A.r + 0.5) continue;
      let da = Math.atan2(dz, dx) - open;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.22) continue;
      g.set(x, Y + 1, z, B.SPRUCE_LOG);
      if (n(x, 6, z) < 0.18) { g.set(x, Y + 2, z, B.SPRUCE_LOG); g.set(x, Y + 3, z, B.SKULL); }
    }
  }

  // --- wolf pen: a taller fence, bones in the dirt, a water trough
  if (L.pen) {
    const P = L.pen;
    for (let dz = -P.r - 1; dz <= P.r + 1; dz++) for (let dx = -P.r - 1; dx <= P.r + 1; dx++) {
      const d = Math.hypot(dx, dz), x = P.x + dx, z = P.z + dz;
      if (d < P.r - 0.5) {
        g.set(x, Y, z, n(x, 7, z) < 0.7 ? B.DIRT : B.GRAVEL);
        if (n(x, 8, z) < 0.04) g.set(x, Y + 1, z, B.BONE);
        continue;
      }
      if (d > P.r + 0.6) continue;
      g.set(x, Y + 1, z, B.SPRUCE_LOG);
      g.set(x, Y + 2, z, n(x, 9, z) < 0.5 ? B.SPRUCE_LOG : B.CHARRED_LOG);
    }
    g.set(P.x, Y + 1, P.z, half(B.COBBLE));
  }

  // --- smithy: an open lean-to over the forge and the anvil
  if (L.anvil) {
    const [ax, , az] = L.anvil;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const x = ax + dx, z = az + dz;
      g.set(x, Y, z, B.COBBLE);
      if (Math.abs(dx) === 2 && Math.abs(dz) === 2) for (let y = Y + 1; y <= Y + 4; y++) g.set(x, y, z, B.SPRUCE_LOG);
      g.set(x, Y + 5, z, B.HIDE);
    }
    g.set(ax, Y + 1, az, B.STEEL);
    const back = Math.sign(ax - cx) || 1;
    for (const dz of [-1, 0, 1]) { g.set(ax + back * 2, Y + 1, az + dz, B.COBBLE); g.set(ax + back * 2, Y + 2, az + dz, dz === 0 ? B.MAGMA : B.COBBLE); }
    for (let y = Y + 3; y <= Y + 7; y++) g.set(ax + back * 2, y, az, B.COBBLE); // chimney
    g.set(ax, Y + 1, az + 2, B.CRATE);
    g.set(ax - back, Y + 1, az - 2, B.DARK_PLANKS);
    g.set(ax - back, Y + 2, az - 2, B.STEEL);
  }

  // --- javelin range: a hay target on a post, bales behind
  if (L.range) {
    const [x, , z] = L.range.target;
    g.set(x, Y + 1, z, B.SPRUCE_LOG);
    g.set(x, Y + 2, z, B.HAY);
    g.set(x, Y + 3, z, B.SKULL);
  }

  // --- wood pile and hide racks
  if (L.woodpile) {
    const w = L.woodpile;
    const bx = Math.round(w.x + Math.sin(w.yaw)), bz = Math.round(w.z + Math.cos(w.yaw));
    for (let a = -1; a <= 1; a++) for (let y = 1; y <= (a === 0 ? 2 : 1); y++) {
      g.set(bx + (Math.abs(Math.sin(w.yaw)) > 0.5 ? 0 : a), Y + y, bz + (Math.abs(Math.sin(w.yaw)) > 0.5 ? a : 0), B.SPRUCE_LOG);
    }
  }
  for (const rk of L.racks) {
    const bx = Math.round(rk.x + Math.sin(rk.yaw)), bz = Math.round(rk.z + Math.cos(rk.yaw));
    const [ox, oz] = Math.abs(Math.sin(rk.yaw)) > 0.5 ? [0, 1] : [1, 0];
    for (const s of [-1, 1]) { g.set(bx + ox * s, Y + 1, bz + oz * s, B.SPRUCE_LOG); g.set(bx + ox * s, Y + 2, bz + oz * s, B.SPRUCE_LOG); }
    g.set(bx, Y + 2, bz, B.HIDE);
  }

  // --- huts: round hide tents on log ribs
  for (const h of L.huts) buildHut(g, h, Y, n);

  // Scattered bones and crates.
  for (let k = 0; k < (L.capital ? 40 : 10); k++) {
    const a = n(k, 10, 0) * TAU, d = 4 + n(k, 11, 0) * (R - 6);
    const x = Math.round(cx + Math.cos(a) * d), z = Math.round(cz + Math.sin(a) * d);
    if (g.get(x, Y + 1, z) !== C_AIR || g.get(x, Y, z) === B.MAGMA) continue;
    const [along, across] = local(x, z);
    if (along > 0 && Math.abs(across) < 3) continue;
    g.set(x, Y + 1, z, n(k, 12, 0) < 0.5 ? B.BONE : n(k, 12, 0) < 0.75 ? B.CRATE : B.SKULL);
  }

  return {
    ox: g.ox, oy: g.oy, oz: g.oz, w: g.w, h: g.h, d: g.w, cells: g.cells,
    half: R, cx, cz, floorY: Y, texts, surface, clearMask: true,
  };
}

function buildHut(g: Grid, h: Hut, Y: number, n: (x: number, y: number, z: number, k?: number) => number): void {
  const R = Math.ceil(h.r) + 1;
  const doorA = Math.atan2(Math.cos(h.yaw), Math.sin(h.yaw)); // yaw -> world angle (x = cos, z = sin)
  const levels = Math.ceil(h.r / 0.9);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dz);
    if (d > h.r + 0.35) continue;
    const x = h.x + dx, z = h.z + dz;
    g.set(x, Y, z, n(x, 20, z) < 0.6 ? B.DIRT : B.PATH);
    let da = Math.atan2(dz, dx) - doorA;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const wall = d > h.r - 0.85;
    const door = wall && Math.abs(da) < (h.big ? 0.42 : 0.5);
    // Ribs at four points round the wall.
    const rib = wall && !door && Math.abs(dx) + Math.abs(dz) >= Math.round(h.r) && (dx === 0 || dz === 0);
    for (let y = Y + 1; y <= Y + 2; y++) g.set(x, y, z, door ? C_AIR : wall ? (rib ? B.SPRUCE_LOG : B.HIDE) : C_AIR);
    // Cone roof in shrinking rings.
    for (let k = 0; k <= levels; k++) {
      const outer = h.r - k * 0.9;
      const y = Y + 3 + k;
      if (d <= outer + 0.35 && d > outer - 1.1) g.set(x, y, z, door && k === 0 && d > h.r - 0.5 ? B.SPRUCE_LOG : B.HIDE);
      else if (d <= outer - 1.1) g.set(x, y, z, C_AIR);
    }
  }
  const tip = Y + 3 + levels;
  g.set(h.x, tip, h.z, B.SPRUCE_LOG);
  g.set(h.x, tip + 1, h.z, h.big || n(h.x, 21, h.z) < 0.35 ? B.SKULL : B.SPRUCE_LOG);
  // A crate or a bedroll inside.
  g.set(h.x, Y + 1, h.z, n(h.x, 22, h.z) < 0.5 ? B.HAY : B.CRATE);
}
